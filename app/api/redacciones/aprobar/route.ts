import { NextResponse } from "next/server";
import { CardStatus, RedactionStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { applyCardTransition } from "@/lib/card-transition";

const schema = z
  .object({
    redactionId: z.string().cuid().optional(),
    redactionIds: z.array(z.string().cuid()).optional(),
  })
  .refine(
    (data) => Boolean(data.redactionId) || Boolean(data.redactionIds?.length),
    "Debe indicar una o mas redacciones",
  );

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const redactionIds = [
    ...(parsed.data.redactionId ? [parsed.data.redactionId] : []),
    ...(parsed.data.redactionIds ?? []),
  ];
  const uniqueIds = [...new Set(redactionIds)];

  const redactions = await prisma.redaction.findMany({
    where: { id: { in: uniqueIds } },
    include: { items: true },
  });

  if (!redactions.length) {
    return NextResponse.json({ error: "Redaccion no encontrada" }, { status: 404 });
  }

  const alreadyApproved = redactions.find((redaction) => redaction.status === RedactionStatus.APROBADA);
  if (alreadyApproved) {
    return NextResponse.json(
      { error: `Redaccion ${alreadyApproved.id} ya aprobada` },
      { status: 409 },
    );
  }

  try {
    const summary = await prisma.$transaction(async (tx) => {
      let updatedItems = 0;

    for (const redaction of redactions) {
      for (const item of redaction.items) {
        const card = await tx.card.findUnique({
          where: { id: item.cardId },
          select: {
            id: true,
            tc: true,
            status: true,
            returnReason: true,
            digitalDeliveryCycle: true,
            currentMessengerId: true,
          },
        });
        if (!card) continue;

        const nextStatus = item.appliedStatus as CardStatus;
        const requiresReturnReason =
          nextStatus === CardStatus.RETORNADA || nextStatus === CardStatus.DEVUELTA_TIENDA;
        if (requiresReturnReason && !item.comentario?.trim()) {
          throw new Error("RETURN_REASON_REQUIRED");
        }
        const changed = card.status !== nextStatus;

        await applyCardTransition({
          tx,
          card,
          nextStatus,
          byUserId: auth.session.user.id,
          note: item.comentario || `Actualizada por redaccion ${redaction.id}`,
          returnReason: requiresReturnReason ? item.comentario?.trim() ?? null : null,
          alwaysLog: changed || Boolean(item.comentario),
          data: {
            isRemote: item.isRemote ?? undefined,
            currentMessengerId:
              nextStatus === CardStatus.ENTREGADA ||
              nextStatus === CardStatus.RETORNADA ||
              nextStatus === CardStatus.DEVUELTA_TIENDA
                ? null
                : undefined,
            lastAssignedMessengerId:
              (nextStatus === CardStatus.ENTREGADA ||
                nextStatus === CardStatus.RETORNADA ||
                nextStatus === CardStatus.DEVUELTA_TIENDA) &&
              card.currentMessengerId
                ? card.currentMessengerId
                : undefined,
          },
        });

        updatedItems += 1;
      }

      await tx.redaction.update({
        where: { id: redaction.id },
        data: {
          status: RedactionStatus.APROBADA,
          approvedAt: new Date(),
          approvedById: auth.session.user.id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        entity: "REDACTION",
        entityId: uniqueIds.join(","),
        action: "APPROVE",
        userId: auth.session.user.id,
        details: {
          redactions: uniqueIds,
          updatedItems,
        },
      },
    });

      return {
        redactions: uniqueIds.length,
        updatedItems,
      };
    });

    return NextResponse.json({
      approved: true,
      ...summary,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RETURN_REASON_REQUIRED") {
      return NextResponse.json(
        { error: "Toda tarjeta retornada/devuelta debe tener motivo de devolucion" },
        { status: 400 },
      );
    }
    throw error;
  }
}
