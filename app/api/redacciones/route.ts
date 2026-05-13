import { NextRequest, NextResponse } from "next/server";
import { CardStatus, Prisma, RedactionStatus, RedactionType } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ADD_ITEMS"),
    redactionId: z.string().cuid(),
    items: z
      .array(
        z.object({
          cardId: z.string().cuid(),
          isRemote: z.boolean().optional(),
          comentario: z.string().optional(),
        }),
      )
      .min(1),
  }),
]);

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const status = request.nextUrl.searchParams.get("status");
  const zona = request.nextUrl.searchParams.get("zona");
  const tipo = request.nextUrl.searchParams.get("tipo");
  const date = request.nextUrl.searchParams.get("date");
  const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(request.nextUrl.searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, Math.trunc(pageSizeRaw))) : 20;

  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;
  if (zona && zona !== "ALL") where.zona = zona;
  if (tipo && tipo !== "ALL") where.tipo = tipo;
  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.fecha = { gte: start, lt: end };
  }

  const [redacciones, total] = await Promise.all([
    prisma.redaction.findMany({
      where,
      include: {
        approvedBy: true,
        items: { include: { card: { include: { customer: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.redaction.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return NextResponse.json({
    redacciones,
    pagination: { page, pageSize, total, totalPages },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  if (parsed.data.action === "ADD_ITEMS") {
    const redaction = await prisma.redaction.findUnique({
      where: { id: parsed.data.redactionId },
      include: {
        items: true,
      },
    });

    if (!redaction) {
      return NextResponse.json({ error: "Relacion no encontrada" }, { status: 404 });
    }

    if (redaction.status === RedactionStatus.ANULADA) {
      return NextResponse.json({ error: "No se puede modificar una relacion anulada" }, { status: 409 });
    }

    const dedupedItems = Array.from(
      new Map(
        parsed.data.items.map((item) => [item.cardId, item]),
      ).values(),
    );
    const existingCardIds = new Set(redaction.items.map((item) => item.cardId));
    const toCreate = dedupedItems.filter((item) => !existingCardIds.has(item.cardId));

    if (!toCreate.length) {
      return NextResponse.json({ error: "Todas las tarjetas ya pertenecen a esta relacion" }, { status: 409 });
    }

    const cards = await prisma.card.findMany({
      where: { id: { in: toCreate.map((item) => item.cardId) } },
      select: { id: true },
    });
    if (cards.length !== toCreate.length) {
      return NextResponse.json({ error: "Hay tarjetas seleccionadas que no existen" }, { status: 404 });
    }

    const appliedStatus =
      redaction.tipo === RedactionType.RETORNO
        ? CardStatus.RETORNADA
        : CardStatus.ENTREGADA;
    const requiresReturnReason = appliedStatus === CardStatus.RETORNADA;
    const missingReason = requiresReturnReason
      ? toCreate.find((item) => !(item.comentario ?? redaction.notas ?? "").trim())
      : null;
    if (missingReason) {
      return NextResponse.json(
        { error: "Debes indicar motivo de devolucion para todas las tarjetas agregadas a una relacion de retorno" },
        { status: 400 },
      );
    }

    const createdCount = toCreate.length;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.redactionItem.createMany({
        data: toCreate.map((item) => ({
          redactionId: redaction.id,
          cardId: item.cardId,
          isRemote: item.isRemote ?? null,
          comentario: item.comentario ?? redaction.notas ?? null,
          appliedStatus,
        })),
      });

      if (redaction.status === RedactionStatus.APROBADA) {
        for (const item of toCreate) {
          const card = await tx.card.findUnique({
            where: { id: item.cardId },
            select: { id: true, status: true, returnReason: true },
          });
          if (!card) {
            continue;
          }

          const comentario = (item.comentario ?? redaction.notas ?? "").trim();
          await tx.card.update({
            where: { id: card.id },
            data: {
              status: appliedStatus,
              isRemote: item.isRemote ?? undefined,
              returnReason: requiresReturnReason ? comentario : null,
              currentMessengerId:
                appliedStatus === CardStatus.ENTREGADA || appliedStatus === CardStatus.RETORNADA
                  ? null
                  : undefined,
            },
          });

          await clearUrgencyOnCardClosure({
            tx,
            cardId: card.id,
            nextStatus: appliedStatus,
            byUserId: auth.session.user.id,
          });

          await tx.cardStatusLog.create({
            data: {
              cardId: card.id,
              fromStatus: card.status,
              toStatus: appliedStatus,
              note: comentario || `Tarjeta agregada a relacion aprobada ${redaction.id}`,
              byUserId: auth.session.user.id,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          entity: "REDACTION",
          entityId: redaction.id,
          action: "ADD_ITEMS",
          userId: auth.session.user.id,
          details: {
            createdCount,
            appliedStatus,
            redactionStatus: redaction.status,
          } as Prisma.InputJsonValue,
        },
      });

      return tx.redaction.findUnique({
        where: { id: redaction.id },
        include: {
          approvedBy: true,
          items: { include: { card: { include: { customer: true } } } },
        },
      });
    });

    return NextResponse.json({
      redaction: updated,
      addedItems: createdCount,
      appliedImmediately: redaction.status === RedactionStatus.APROBADA,
    });
  }

  return NextResponse.json({ error: "Accion no soportada" }, { status: 400 });
}
