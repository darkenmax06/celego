import { NextRequest, NextResponse } from "next/server";
import { CardStatus, Prisma, RouteStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import {
  findOperationalCardCandidates,
  resolveOperationalIdentifier,
} from "@/lib/operational-card-service";
import { prisma } from "@/lib/prisma";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";

const createSchema = z.object({
  fecha: z.string(),
  messengerId: z.string().cuid(),
  identifiers: z.array(z.string().min(1)).min(1),
  notas: z.string().optional(),
});

const routeResultSchema = z.enum([
  "EN_RUTA",
  "ENTREGADA",
  "RETORNADA",
  "ACUSE_RECIBIDO",
  "DEVUELTA_TIENDA",
]);

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE_ROUTE_STATUS"),
    routeId: z.string().cuid(),
    status: z.nativeEnum(RouteStatus),
  }),
  z.object({
    action: z.literal("UPDATE_ITEM_RESULT"),
    itemId: z.string().cuid(),
    result: routeResultSchema,
    comentario: z.string().optional(),
  }),
  z.object({
    action: z.literal("SCAN_ITEM"),
    routeId: z.string().cuid(),
    identifier: z.string().min(1),
    itemId: z.string().cuid().optional(),
    confirmClosed: z.boolean().optional(),
    result: routeResultSchema.optional(),
    comentario: z.string().optional(),
  }),
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parsePagination(request: NextRequest) {
  const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(request.nextUrl.searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, Math.trunc(pageSizeRaw))) : 20;
  return { page, pageSize };
}

type RouteLifecycleResult = "EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA";

const CLOSED_CARD_STATUSES = [CardStatus.RETORNADA, CardStatus.DEVUELTA_TIENDA] as const;
const CARD_ASSIGNMENT_CLOSED = "CARD_ASSIGNMENT_CLOSED";
const CARD_CLOSED_REQUIRES_CONFIRMATION = "CARD_CLOSED_REQUIRES_CONFIRMATION";

function isClosedCardStatus(status: CardStatus | string) {
  return CLOSED_CARD_STATUSES.includes(status as (typeof CLOSED_CARD_STATUSES)[number]);
}

function normalizeRouteResult(value: z.infer<typeof routeResultSchema>): RouteLifecycleResult {
  if (value === "ENTREGADA" || value === "ACUSE_RECIBIDO") return "ACUSE_RECIBIDO";
  if (value === "RETORNADA" || value === "DEVUELTA_TIENDA") return "DEVUELTA_TIENDA";
  return "EN_RUTA";
}

async function recalculateRouteStatus(tx: Prisma.TransactionClient, routeId: string) {
  const items = await tx.routeItem.findMany({
    where: { routeId },
    select: { checkedAt: true },
  });
  if (!items.length) {
    return RouteStatus.PENDIENTE;
  }

  const allChecked = items.every((item) => Boolean(item.checkedAt));
  const anyChecked = items.some((item) => Boolean(item.checkedAt));

  const nextStatus = allChecked
    ? RouteStatus.COMPLETADA
    : anyChecked
      ? RouteStatus.EN_PROCESO
      : RouteStatus.PENDIENTE;

  await tx.route.update({
    where: { id: routeId },
    data: { status: nextStatus },
  });
  return nextStatus;
}

async function applyItemResult(
  tx: Prisma.TransactionClient,
  input: { itemId: string; result: z.infer<typeof routeResultSchema>; comentario?: string },
  byUserId?: string,
  options?: { requireOpenCard?: boolean },
) {
  const item = await tx.routeItem.findUnique({
    where: { id: input.itemId },
    include: {
      card: true,
      route: {
        include: { messenger: true },
      },
    },
  });
  if (!item) {
    throw new Error("ITEM_NOT_FOUND");
  }

  if (options?.requireOpenCard && isClosedCardStatus(item.card.status)) {
    throw new Error(CARD_CLOSED_REQUIRES_CONFIRMATION);
  }

  const lifecycleResult = normalizeRouteResult(input.result);
  const shouldSetChecked = lifecycleResult !== "EN_RUTA";
  const trimmedComment = input.comentario?.trim();
  const fallbackReason = item.card.returnReason?.trim();
  const returnReason = trimmedComment || fallbackReason || null;

  if (lifecycleResult === "DEVUELTA_TIENDA" && !returnReason) {
    throw new Error("RETURN_REASON_REQUIRED");
  }

  await tx.routeItem.update({
    where: { id: item.id },
    data: {
      checkedAt: shouldSetChecked ? new Date() : null,
    },
  });

  const metadataRoot = asRecord(item.card.metadata);
  const existingRoute = asRecord(metadataRoot.route);
  const routePayload: Record<string, unknown> = {
    ...existingRoute,
    result: lifecycleResult,
    comentario: lifecycleResult === "DEVUELTA_TIENDA" ? (returnReason ?? "") : (trimmedComment ?? ""),
    routeId: item.routeId,
    messengerId: item.route.messengerId,
    updatedAt: new Date().toISOString(),
  };

  const nextStatus =
    lifecycleResult === "ACUSE_RECIBIDO"
      ? CardStatus.ACUSE_RECIBIDO
      : lifecycleResult === "DEVUELTA_TIENDA"
        ? CardStatus.DEVUELTA_TIENDA
        : CardStatus.EN_RUTA;

  await tx.card.update({
    where: { id: item.cardId },
    data: {
      status: nextStatus,
      returnReason: lifecycleResult === "DEVUELTA_TIENDA" ? returnReason : null,
      currentMessengerId: item.route.messengerId,
      metadata: {
        ...metadataRoot,
        route: routePayload,
      } as Prisma.InputJsonValue,
    },
  });

  await clearUrgencyOnCardClosure({
    tx,
    cardId: item.cardId,
    nextStatus,
    byUserId,
  });

  if (lifecycleResult !== "EN_RUTA" || input.comentario || item.card.status !== nextStatus) {
    const messengerInfo = item.route.messenger?.nombre
      ? ` por mensajero ${item.route.messenger.nombre}`
      : "";
    const notePrefix =
      lifecycleResult === "ACUSE_RECIBIDO"
        ? `Acuse recibido${messengerInfo}`
        : lifecycleResult === "DEVUELTA_TIENDA"
          ? `Tarjeta devuelta a tienda${messengerInfo}`
          : "Actualizacion en ruta";

    await tx.cardStatusLog.create({
      data: {
        cardId: item.cardId,
        fromStatus: item.card.status,
        toStatus: nextStatus,
        note: input.comentario
          ? `${notePrefix}: ${input.comentario}`
          : `${notePrefix} (ruta ${item.routeId})`,
        byUserId,
      },
    });
  }

  const routeStatus = await recalculateRouteStatus(tx, item.routeId);
  return { itemId: item.id, cardId: item.cardId, routeId: item.routeId, routeStatus };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const date = request.nextUrl.searchParams.get("date");
  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const { page, pageSize } = parsePagination(request);

  const where: Record<string, unknown> = {};
  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.fecha = { gte: start, lt: end };
  }
  if (messengerId) where.messengerId = messengerId;

  const [routes, total] = await Promise.all([
    prisma.route.findMany({
      where,
      include: {
        messenger: true,
        items: {
          include: {
            card: {
              include: { customer: true },
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.route.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return NextResponse.json({
    routes,
    pagination: { page, pageSize, total, totalPages },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const identifiers = parsed.data.identifiers
    .map((identifier) => identifier.trim())
    .filter(Boolean);
  const uniqueIdentifiers = [...new Set(identifiers)];

  const cards = await findOperationalCardCandidates(uniqueIdentifiers);

  const usedCardIds = new Set<string>();
  const selectedCards: typeof cards = [];
  const conflicts: Array<{
    identifier: string;
    kind: "REQUIERE_SELECCION" | "SOLO_CERRADAS";
    cards: typeof cards;
  }> = [];

  for (const identifier of uniqueIdentifiers) {
    const resolution = resolveOperationalIdentifier(identifier, cards);
    if (resolution.kind === "REQUIERE_SELECCION") {
      conflicts.push({ identifier, kind: resolution.kind, cards: resolution.options });
      continue;
    }
    if (resolution.kind === "SOLO_CERRADAS") {
      conflicts.push({ identifier, kind: resolution.kind, cards: resolution.closedCards });
      continue;
    }
    if (resolution.kind === "RESUELTA" && !usedCardIds.has(resolution.card.id)) {
      if (isClosedCardStatus(resolution.card.status)) {
        conflicts.push({ identifier, kind: "SOLO_CERRADAS", cards: [resolution.card] });
        continue;
      }
      usedCardIds.add(resolution.card.id);
      selectedCards.push(resolution.card);
    }
  }

  if (conflicts.length) {
    return NextResponse.json(
      {
        error: "Hay tarjetas que requieren selección o confirmación antes de crear la ruta",
        conflicts,
      },
      { status: 409 },
    );
  }

  if (!selectedCards.length) {
    return NextResponse.json({ error: "No se encontraron tarjetas para la ruta" }, { status: 404 });
  }

  try {
    const route = await prisma.$transaction(async (tx) => {
      const assigned = await tx.card.updateMany({
        where: {
          id: { in: selectedCards.map((card) => card.id) },
          status: { notIn: [...CLOSED_CARD_STATUSES] },
        },
        data: {
          currentMessengerId: parsed.data.messengerId,
          status: CardStatus.EN_RUTA,
        },
      });

      if (assigned.count !== selectedCards.length) {
        throw new Error(CARD_ASSIGNMENT_CLOSED);
      }

      const created = await tx.route.create({
        data: {
          fecha: new Date(parsed.data.fecha),
          messengerId: parsed.data.messengerId,
          notas: parsed.data.notas,
          createdById: auth.session.user.id,
          status: RouteStatus.PENDIENTE,
          items: {
            create: selectedCards.map((card, index) => ({
              cardId: card.id,
              sequence: index + 1,
            })),
          },
        },
        include: {
          items: true,
          messenger: true,
        },
      });

      await tx.cardStatusLog.createMany({
        data: selectedCards.map((card) => ({
          cardId: card.id,
          fromStatus: card.status,
          toStatus: CardStatus.EN_RUTA,
          note: `Asignada a mensajero ${created.messenger.nombre} (ruta ${created.id})`,
          byUserId: auth.session.user.id,
        })),
      });

      return created;
    });

    return NextResponse.json({ route }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === CARD_ASSIGNMENT_CLOSED) {
      return NextResponse.json(
        {
          error:
            "Una o mas tarjetas fueron retornadas o devueltas mientras se creaba la ruta. Recarga y selecciona tarjetas vigentes.",
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }
  const payload = parsed.data;

  switch (payload.action) {
    case "UPDATE_ROUTE_STATUS": {
      const route = await prisma.route.update({
        where: { id: payload.routeId },
        data: { status: payload.status },
      });
      return NextResponse.json({ route });
    }
    case "UPDATE_ITEM_RESULT": {
      try {
        const result = await prisma.$transaction((tx) =>
          applyItemResult(
            tx,
            {
              itemId: payload.itemId,
              result: payload.result,
              comentario: payload.comentario,
            },
            auth.session.user.id,
          ),
        );
        return NextResponse.json({ updated: true, ...result });
      } catch (error) {
        if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
          return NextResponse.json({ error: "Item de ruta no encontrado" }, { status: 404 });
        }
        if (error instanceof Error && error.message === "RETURN_REASON_REQUIRED") {
          return NextResponse.json(
            { error: "Motivo de devolucion requerido para marcar tarjeta retornada" },
            { status: 400 },
          );
        }
        throw error;
      }
    }
    case "SCAN_ITEM": {
      const route = await prisma.route.findUnique({
        where: { id: payload.routeId },
        include: {
          items: {
            include: { card: { include: { customer: true } } },
          },
        },
      });
      if (!route) {
        return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
      }

      const identifier = payload.identifier.trim();
      const toCandidate = (item: (typeof route.items)[number]) => ({
        itemId: item.id,
        cardId: item.card.id,
        tc: item.card.tc,
        cedula: item.card.customer.cedula,
        nombre: item.card.customer.nombre,
        status: item.card.status,
        dispatchDate: item.card.dispatchDate,
        returnReason: item.card.returnReason,
      });
      const conflict = (
        kind: "REQUIERE_SELECCION" | "SOLO_CERRADAS",
        items: readonly (typeof route.items)[number][],
      ) =>
        NextResponse.json(
          {
            error:
              kind === "SOLO_CERRADAS"
                ? "La tarjeta encontrada esta cerrada y requiere confirmacion explicita"
                : "Hay varias tarjetas vigentes que coinciden; selecciona una explicitamente",
            kind,
            candidates: items.map(toCandidate),
          },
          { status: 409 },
        );

      let foundItem: (typeof route.items)[number] | undefined;
      if (payload.itemId) {
        const explicitItems = route.items.filter((item) => item.id === payload.itemId);
        if (!explicitItems.length) {
          return NextResponse.json({ error: "Item de ruta no encontrado" }, { status: 404 });
        }
        foundItem = explicitItems[0];
      } else {
        const explicitCardItems = route.items.filter((item) => item.card.id === identifier);
        if (explicitCardItems.length > 1) {
          return conflict("REQUIERE_SELECCION", explicitCardItems);
        }
        if (explicitCardItems.length === 1) {
          foundItem = explicitCardItems[0];
        } else {
          const resolution = resolveOperationalIdentifier(
            identifier,
            route.items.map((item) => item.card),
          );
          if (resolution.kind === "REQUIERE_SELECCION") {
            return conflict(
              resolution.kind,
              route.items.filter((item) =>
                resolution.options.some((card) => card.id === item.card.id),
              ),
            );
          }
          if (resolution.kind === "SOLO_CERRADAS") {
            return conflict(
              resolution.kind,
              route.items.filter((item) =>
                resolution.closedCards.some((card) => card.id === item.card.id),
              ),
            );
          }
          if (resolution.kind === "RESUELTA") {
            const resolvedItems = route.items.filter((item) => item.card.id === resolution.card.id);
            if (resolvedItems.length > 1) {
              return conflict("REQUIERE_SELECCION", resolvedItems);
            }
            foundItem = resolvedItems[0];
          }
        }
      }

      if (!foundItem) {
        return NextResponse.json({ error: "Tarjeta no encontrada en la ruta" }, { status: 404 });
      }

      if (isClosedCardStatus(foundItem.card.status) && !payload.confirmClosed) {
        return conflict("SOLO_CERRADAS", [foundItem]);
      }

      try {
        const result = await prisma.$transaction((tx) =>
          applyItemResult(
            tx,
            {
              itemId: foundItem.id,
              result: payload.result ?? "EN_RUTA",
              comentario: payload.comentario,
            },
            auth.session.user.id,
            { requireOpenCard: !payload.confirmClosed },
          ),
        );

        return NextResponse.json({
          scanned: {
            itemId: foundItem.id,
            tc: foundItem.card.tc,
            cedula: foundItem.card.customer.cedula,
            nombre: foundItem.card.customer.nombre,
          },
          ...result,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "RETURN_REASON_REQUIRED") {
          return NextResponse.json(
            { error: "Motivo de devolucion requerido para marcar tarjeta retornada" },
            { status: 400 },
          );
        }
        if (error instanceof Error && error.message === CARD_CLOSED_REQUIRES_CONFIRMATION) {
          return NextResponse.json(
            { error: "La tarjeta se cerro antes de actualizarla. Confirma la seleccion explicitamente." },
            { status: 409 },
          );
        }
        throw error;
      }
    }
  }
}
