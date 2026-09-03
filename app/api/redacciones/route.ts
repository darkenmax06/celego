import { NextRequest, NextResponse } from "next/server";
import { CardStatus, Prisma, RedactionStatus, RedactionType } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { buildListEnvelope, compile, ListQueryValidationError } from "@/lib/list-query";
import { redaccionesListQuery } from "@/lib/list-query/descriptors/redacciones";
import { prisma } from "@/lib/prisma";
import { assertRedactionOrigin } from "@/lib/dispatch-origin";
import { applyCardTransition } from "@/lib/card-transition";

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

  // `status`/`tipo`/`origin` keep the "ALL" sentinel; `date` stays a SINGLE
  // param expanded to [start, start + 1 day). The descriptor additionally
  // VALIDATES the three enums: previously an unknown value reached Prisma and
  // failed the request, so this reports it as a 400 instead.
  let query;
  try {
    query = compile(redaccionesListQuery, request.nextUrl.searchParams);
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json(
        { error: `Valor no permitido para ${error.param}` },
        { status: 400 },
      );
    }
    throw error;
  }
  const where = query.where;

  const [redacciones, total] = await Promise.all([
    prisma.redaction.findMany({
      where,
      include: {
        approvedBy: true,
        items: {
          include: { card: { include: { customer: true } } },
          orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        },
      },
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    }),
    prisma.redaction.count({ where }),
  ]);

  return NextResponse.json({
    redacciones,
    pagination: buildListEnvelope({ page: query.page, pageSize: query.pageSize, total }),
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
      select: { id: true, dispatchOrigin: true },
    });
    if (cards.length !== toCreate.length) {
      return NextResponse.json({ error: "Hay tarjetas seleccionadas que no existen" }, { status: 404 });
    }
    if (!redaction.dispatchOrigin) {
      return NextResponse.json({ error: "MISSING_DISPATCH_ORIGIN" }, { status: 409 });
    }
    try {
      assertRedactionOrigin(redaction.dispatchOrigin, cards.map((card) => card.dispatchOrigin));
    } catch (error) {
      const code = error instanceof Error ? error.message : "MIXED_DISPATCH_ORIGIN";
      return NextResponse.json({ error: code }, { status: 409 });
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
    const firstSequence =
      redaction.items.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.redactionItem.createMany({
        data: toCreate.map((item, index) => ({
          redactionId: redaction.id,
          cardId: item.cardId,
          isRemote: item.isRemote ?? null,
          comentario: item.comentario ?? redaction.notas ?? null,
          appliedStatus,
          sequence: firstSequence + index,
        })),
      });

      if (redaction.status === RedactionStatus.APROBADA) {
        for (const item of toCreate) {
          const card = await tx.card.findUnique({
            where: { id: item.cardId },
            select: {
              id: true,
              tc: true,
              status: true,
              returnReason: true,
              currentMessengerId: true,
              digitalDeliveryCycle: true,
            },
          });
          if (!card) {
            continue;
          }

          const comentario = (item.comentario ?? redaction.notas ?? "").trim();
          await applyCardTransition({
            tx,
            card,
            nextStatus: appliedStatus,
            byUserId: auth.session.user.id,
            note: comentario || `Tarjeta agregada a relacion aprobada ${redaction.id}`,
            returnReason: requiresReturnReason ? comentario : null,
            data: {
              isRemote: item.isRemote ?? undefined,
              currentMessengerId:
                appliedStatus === CardStatus.ENTREGADA || appliedStatus === CardStatus.RETORNADA
                  ? null
                  : undefined,
              lastAssignedMessengerId:
                (appliedStatus === CardStatus.ENTREGADA || appliedStatus === CardStatus.RETORNADA) &&
                card.currentMessengerId
                  ? card.currentMessengerId
                  : undefined,
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
          items: {
            include: { card: { include: { customer: true } } },
            orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          },
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
