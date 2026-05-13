import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import {
  clampUrgencyLevel,
  emitDueUrgentNotifications,
  getActiveUrgentCase,
  nextUrgentNotificationAt,
  urgentStatusLabel,
  urgencyIntervalMinutes,
  urgencyLevelLabel,
} from "@/lib/urgent-alerts";

const updateSchema = z.object({
  cardId: z.string().cuid(),
  urgent: z.boolean().optional(),
  level: z.number().int().min(1).max(5).optional(),
  resolve: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const notifications = await emitDueUrgentNotifications({
    byUserId: auth.session.user.id,
    limit: 25,
  });

  return NextResponse.json({
    notifications,
    count: notifications.length,
    checkedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const now = new Date();
  const shouldResolve = parsed.data.resolve === true || parsed.data.urgent === false;
  const shouldMarkUrgent = parsed.data.urgent === true && !shouldResolve;
  if (!shouldResolve && !shouldMarkUrgent) {
    return NextResponse.json({ error: "Debes indicar accion de urgencia" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({
    where: { id: parsed.data.cardId },
    include: { customer: true },
  });
  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }

  const activeCase = await getActiveUrgentCase(card.id);

  if (shouldResolve) {
    const updates = await prisma.$transaction(async (tx) => {
      let resolvedCaseId: string | null = null;
      let resolvedLevel: number | null = null;

      if (activeCase) {
        resolvedCaseId = activeCase.id;
        resolvedLevel = clampUrgencyLevel(activeCase.level);
        await tx.urgentCase.update({
          where: { id: activeCase.id },
          data: {
            status: "RESUELTO",
            resolvedAt: now,
            resolvedById: auth.session.user.id,
            nextNotificationAt: null,
          },
        });
      }

      if (card.urgent) {
        await tx.card.update({
          where: { id: card.id },
          data: { urgent: false },
        });
      }

      if (activeCase || card.urgent) {
        const suffix = resolvedLevel ? ` (${urgencyLevelLabel(resolvedLevel)})` : "";
        await tx.cardStatusLog.create({
          data: {
            cardId: card.id,
            fromStatus: card.status,
            toStatus: card.status,
            note:
              parsed.data.note?.trim() ||
              `Caso urgente resuelto${suffix}.`,
            byUserId: auth.session.user.id,
          },
        });
      }

      return { resolvedCaseId, resolvedLevel };
    });

    return NextResponse.json({
      ok: true,
      action: "RESUELTO",
      cardId: card.id,
      urgent: false,
      level: updates.resolvedLevel,
      urgentCaseId: updates.resolvedCaseId,
    });
  }

  const level = clampUrgencyLevel(parsed.data.level ?? activeCase?.level ?? 3);
  const intervalMinutes = urgencyIntervalMinutes(level);
  const label = urgencyLevelLabel(level);
  const nextAt = nextUrgentNotificationAt(level, now);

  const responsePayload = await prisma.$transaction(async (tx) => {
    let nextCase = activeCase;
    let action: "CREATED" | "UPDATED" | "UNCHANGED" = "UNCHANGED";
    let changedLevel = false;
    let becameUrgent = false;

    if (!nextCase) {
      nextCase = await tx.urgentCase.create({
        data: {
          cardId: card.id,
          tc: card.tc,
          cedula: card.customer.cedula,
          provincia: card.provincia,
          telefono: card.customer.telefonosRaw,
          direccion: card.customer.direccionRaw,
          status: urgentStatusLabel(level),
          level,
          createdById: auth.session.user.id,
          nextNotificationAt: nextAt,
        },
      });
      action = "CREATED";
    } else {
      changedLevel = clampUrgencyLevel(nextCase.level) !== level;
      const shouldReschedule = changedLevel || !nextCase.nextNotificationAt;
      const updatedCase = await tx.urgentCase.update({
        where: { id: nextCase.id },
        data: {
          tc: card.tc,
          cedula: card.customer.cedula,
          provincia: card.provincia,
          telefono: card.customer.telefonosRaw,
          direccion: card.customer.direccionRaw,
          status: urgentStatusLabel(level),
          level,
          resolvedAt: null,
          resolvedById: null,
          nextNotificationAt: shouldReschedule ? nextAt : nextCase.nextNotificationAt,
        },
      });
      nextCase = updatedCase;
      action = changedLevel ? "UPDATED" : "UNCHANGED";
    }

    if (!card.urgent) {
      await tx.card.update({
        where: { id: card.id },
        data: { urgent: true },
      });
      becameUrgent = true;
      if (action === "UNCHANGED") {
        action = "UPDATED";
      }
    }

    if (action !== "UNCHANGED" || parsed.data.note?.trim()) {
      const defaultNote =
        action === "CREATED"
          ? `Caso urgente creado (${label}). Notificacion cada ${intervalMinutes} minutos.`
          : changedLevel
            ? `Caso urgente actualizado a ${label}. Notificacion cada ${intervalMinutes} minutos.`
            : `Caso urgente confirmado (${label}).`;
      await tx.cardStatusLog.create({
        data: {
          cardId: card.id,
          fromStatus: card.status,
          toStatus: card.status,
          note: parsed.data.note?.trim() || defaultNote,
          byUserId: auth.session.user.id,
        },
      });
    }

    return {
      action,
      becameUrgent,
      urgentCaseId: nextCase.id,
      nextNotificationAt: nextCase.nextNotificationAt?.toISOString() ?? nextAt.toISOString(),
    };
  });

  const notifyNow = responsePayload.action === "CREATED" || responsePayload.becameUrgent;

  return NextResponse.json({
    ok: true,
    action: responsePayload.action,
    cardId: card.id,
    urgent: true,
    level,
    label,
    intervalMinutes,
    urgentCaseId: responsePayload.urgentCaseId,
    nextNotificationAt: responsePayload.nextNotificationAt,
    notifyNow,
    notification: notifyNow
      ? {
          urgentCaseId: responsePayload.urgentCaseId,
          cardId: card.id,
          tc: card.tc,
          cliente: card.customer.nombre,
          cedula: card.customer.cedula,
          provincia: card.provincia,
          level,
          label,
          intervalMinutes,
          nextNotificationAt: responsePayload.nextNotificationAt,
        }
      : null,
  });
}
