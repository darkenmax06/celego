import { NextRequest, NextResponse } from "next/server";
import { CardProductType, CardStatus, Prisma, RouteStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";

const createSchema = z.object({
  fecha: z.string(),
  messengerId: z.string().cuid(),
  identifiers: z.array(z.string().min(1)).max(500).optional().default([]),
  // Los cardIds se reciben solamente tras la previsualizacion. Esto evita que
  // una cedula/solicitud ambigua cree una ruta con el despacho equivocado.
  cardIds: z.array(z.string().cuid()).max(500).optional(),
  notas: z.string().optional(),
}).refine((value) => value.identifiers.length > 0 || (value.cardIds?.length ?? 0) > 0, {
  message: "Debes indicar identificadores o tarjetas seleccionadas",
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

const TERMINAL_CARD_STATUSES: CardStatus[] = [
  CardStatus.ENTREGADA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.RETORNADA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
];

function cardMatchesIdentifier(
  card: { id: string; tc: string | null; requestNumber: string | null; externalReference: string | null; customer: { cedula: string } },
  identifier: string,
) {
  const digits = identifier.replace(/\D/g, "");
  return (
    card.id === identifier ||
    card.tc === identifier ||
    card.requestNumber === identifier ||
    card.externalReference === identifier ||
    card.customer.cedula === identifier ||
    (digits.length > 0 && card.customer.cedula.replace(/\D/g, "") === digits)
  );
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
  const productType = request.nextUrl.searchParams.get("productType");
  const { page, pageSize } = parsePagination(request);

  const where: Record<string, unknown> = {};
  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.fecha = { gte: start, lt: end };
  }
  if (messengerId) where.messengerId = messengerId;
  if (productType && productType !== "ALL" && productType in CardProductType) {
    where.items = { some: { card: { productType: productType as CardProductType } } };
  }

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

  const cards = await prisma.card.findMany({
    where: parsed.data.cardIds?.length
      ? { id: { in: [...new Set(parsed.data.cardIds)] } }
      : {
          OR: uniqueIdentifiers.flatMap((identifier) => [
            { id: identifier },
            { tc: identifier },
            { requestNumber: identifier },
            { externalReference: identifier },
            { customer: { cedula: identifier } },
          ]),
        },
    include: { customer: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!cards.length) {
    return NextResponse.json({ error: "No se encontraron tarjetas" }, { status: 404 });
  }

  const selectedCards: typeof cards = [];
  if (parsed.data.cardIds?.length) {
    const byId = new Map(cards.map((card) => [card.id, card]));
    for (const cardId of parsed.data.cardIds) {
      const card = byId.get(cardId);
      if (card && !selectedCards.some((candidate) => candidate.id === card.id)) selectedCards.push(card);
    }
    if (selectedCards.length !== new Set(parsed.data.cardIds).size) {
      return NextResponse.json({ error: "Una o más tarjetas seleccionadas ya no existen" }, { status: 409 });
    }
  } else {
    for (const identifier of uniqueIdentifiers) {
      const matches = cards.filter((card) => cardMatchesIdentifier(card, identifier));
      if (matches.length !== 1) {
        return NextResponse.json(
          {
            error: matches.length ? "Hay identificadores ambiguos; selecciona el despacho en la previsualizacion" : "Hay identificadores no encontrados",
            requiresResolution: true,
            identifier,
          },
          { status: 409 },
        );
      }
      if (!selectedCards.some((candidate) => candidate.id === matches[0].id)) selectedCards.push(matches[0]);
    }
  }

  if (!selectedCards.length) {
    return NextResponse.json({ error: "No se encontraron tarjetas para la ruta" }, { status: 404 });
  }

  const unavailable = selectedCards.filter((card) => TERMINAL_CARD_STATUSES.includes(card.status));
  if (unavailable.length) {
    return NextResponse.json(
      { error: "Hay tarjetas en estado terminal que no se pueden asignar", cardIds: unavailable.map((card) => card.id) },
      { status: 409 },
    );
  }

  const alreadyAssigned = await prisma.routeItem.findMany({
    where: {
      cardId: { in: selectedCards.map((card) => card.id) },
      route: { status: { in: [RouteStatus.PENDIENTE, RouteStatus.EN_PROCESO] } },
    },
    select: { cardId: true },
  });
  if (alreadyAssigned.length) {
    return NextResponse.json(
      { error: "Hay tarjetas ya asignadas a una ruta activa", cardIds: alreadyAssigned.map((item) => item.cardId) },
      { status: 409 },
    );
  }

  const route = await prisma.route.create({
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

  await prisma.$transaction(async (tx) => {
    for (const card of selectedCards) {
      await tx.card.update({
        where: { id: card.id },
        data: {
          currentMessengerId: parsed.data.messengerId,
          lastAssignedMessengerId: parsed.data.messengerId,
          status: CardStatus.EN_RUTA,
        },
      });
      await tx.cardStatusLog.create({
        data: {
          cardId: card.id,
          fromStatus: card.status,
          toStatus: CardStatus.EN_RUTA,
          note: `Asignada a mensajero ${route.messenger.nombre} (ruta ${route.id})`,
          byUserId: auth.session.user.id,
        },
      });
    }
  });

  return NextResponse.json({ route }, { status: 201 });
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
      const digits = identifier.replace(/\D/g, "");
      const foundItem = route.items.find((item) => {
        return (
          item.card.id === identifier ||
          item.card.tc === identifier ||
          item.card.requestNumber === identifier ||
          item.card.externalReference === identifier ||
          item.card.customer.cedula === identifier ||
          item.card.customer.cedula.replace(/\D/g, "") === digits
        );
      });

      if (!foundItem) {
        return NextResponse.json({ error: "Tarjeta no encontrada en la ruta" }, { status: 404 });
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
          ),
        );

        return NextResponse.json({
          scanned: {
            itemId: foundItem.id,
            tc: foundItem.card.tc ?? foundItem.card.requestNumber ?? "",
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
        throw error;
      }
    }
  }
}
