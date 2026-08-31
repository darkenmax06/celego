import { NextRequest, NextResponse } from "next/server";
import { CardStatus, RouteStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { buildListEnvelope, compile } from "@/lib/list-query";
import { rutasListQuery } from "@/lib/list-query/descriptors/rutas";
import {
  findOperationalCardCandidates,
  resolveOperationalIdentifier,
} from "@/lib/operational-card-service";
import { prisma } from "@/lib/prisma";
import { RETURN_REASON_REQUIRED, normalizeItemResult } from "@/lib/item-outcome";
import {
  applyItemOutcome,
  CARD_CLOSED_REQUIRES_CONFIRMATION,
  ITEM_NOT_FOUND,
} from "@/lib/item-outcome-service";
import { emitTransitionObservations, type TransitionObservation } from "@/lib/card-transition-observer";

const createSchema = z.object({
  fecha: z.string(),
  messengerId: z.string().cuid(),
  identifiers: z.array(z.string().min(1)).min(1),
  // SDD contrato-tarjetas-pistoleo (task 3.1): subset of `identifiers` the
  // analyst marked as requiring a signed contract. Sets `Card.hasContract`
  // on assignment; independent of the existing `contractType` string field.
  contractIdentifiers: z.array(z.string().min(1)).optional().default([]),
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
    // SDD contrato-tarjetas-pistoleo (task 3.2): explicit re-submit flag
    // after the analyst confirms the SIN_CONTRATO_REQUIERE_CONFIRMACION 409.
    confirmMissingContract: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("SCAN_ITEM"),
    routeId: z.string().cuid(),
    identifier: z.string().min(1),
    itemId: z.string().cuid().optional(),
    confirmClosed: z.boolean().optional(),
    result: routeResultSchema.optional(),
    comentario: z.string().optional(),
    confirmMissingContract: z.boolean().optional(),
  }),
]);

// SDD contrato-tarjetas-pistoleo: applies ONLY to the delivered outcome
// (SCAN_ITEM/UPDATE_ITEM_RESULT normalizing to ACUSE_RECIBIDO), never to
// retornada/devuelta-a-tienda, regardless of `hasContract`.
const SIN_CONTRATO_REQUIERE_CONFIRMACION = "SIN_CONTRATO_REQUIERE_CONFIRMACION";

const CLOSED_CARD_STATUSES = [CardStatus.RETORNADA, CardStatus.DEVUELTA_TIENDA] as const;
const CARD_ASSIGNMENT_CLOSED = "CARD_ASSIGNMENT_CLOSED";

function isClosedCardStatus(status: CardStatus | string) {
  return CLOSED_CARD_STATUSES.includes(status as (typeof CLOSED_CARD_STATUSES)[number]);
}

/**
 * Best-effort post-commit flush of `CardTransitionPolicy` SHADOW observations
 * (design D3). `emitTransitionObservations()` already swallows its own
 * errors via `tryWriteAuditEvent` — this wrapper is deliberate
 * defense-in-depth so a future change to that contract can never turn a
 * harmless audit-logging failure into a broken PATCH response.
 */
async function flushTransitionObservations(
  observations: (TransitionObservation | null | undefined)[],
) {
  try {
    await emitTransitionObservations(observations);
  } catch (error) {
    console.error("No se pudieron emitir observaciones de CardTransitionPolicy", error);
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  // `date` stays a SINGLE param expanded to [start, start + 1 day) and
  // `messengerId` an exact match; the descriptor declares nothing else, because
  // the route never accepted anything else.
  const query = compile(rutasListQuery, request.nextUrl.searchParams);
  const where = query.where;

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
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    }),
    prisma.route.count({ where }),
  ]);

  return NextResponse.json({
    routes,
    pagination: buildListEnvelope({ page: query.page, pageSize: query.pageSize, total }),
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

  const contractIdentifierSet = new Set(
    (parsed.data.contractIdentifiers ?? []).map((identifier) => identifier.trim()).filter(Boolean),
  );

  const usedCardIds = new Set<string>();
  const selectedCards: typeof cards = [];
  const contractCardIds = new Set<string>();
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
      if (contractIdentifierSet.has(identifier)) {
        contractCardIds.add(resolution.card.id);
      }
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

      if (contractCardIds.size) {
        await tx.card.updateMany({
          where: { id: { in: Array.from(contractCardIds) } },
          data: { hasContract: true },
        });
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
      const item = await prisma.routeItem.findUnique({
        where: { id: payload.itemId },
        include: { card: { include: { customer: true } } },
      });
      if (!item) {
        return NextResponse.json({ error: "Item de ruta no encontrado" }, { status: 404 });
      }

      const normalizedOutcome = normalizeItemResult("ROUTE", payload.result);
      const missingContract = item.card.hasContract && !item.card.contractImageAt;
      if (
        missingContract &&
        normalizedOutcome === "ACUSE_RECIBIDO" &&
        !payload.confirmMissingContract
      ) {
        return NextResponse.json(
          {
            error: "La tarjeta requiere contrato firmado; confirma para continuar sin el",
            kind: SIN_CONTRATO_REQUIERE_CONFIRMACION,
            candidates: [
              {
                itemId: item.id,
                cardId: item.card.id,
                tc: item.card.tc,
                cedula: item.card.customer.cedula,
                nombre: item.card.customer.nombre,
                status: item.card.status,
                dispatchDate: item.card.dispatchDate,
                returnReason: item.card.returnReason,
              },
            ],
          },
          { status: 409 },
        );
      }

      try {
        const outcome = await prisma.$transaction((tx) =>
          applyItemOutcome({
            tx,
            domain: "ROUTE",
            itemId: payload.itemId,
            result: payload.result,
            comentario: payload.comentario,
            byUserId: auth.session.user.id,
            deliveredWithoutContract: missingContract,
          }),
        );
        await flushTransitionObservations([outcome.observation]);
        return NextResponse.json({
          updated: true,
          itemId: outcome.itemId,
          cardId: outcome.cardId,
          routeId: outcome.routeId,
          routeStatus: outcome.routeStatus,
        });
      } catch (error) {
        if (error instanceof Error && error.message === ITEM_NOT_FOUND) {
          return NextResponse.json({ error: "Item de ruta no encontrado" }, { status: 404 });
        }
        if (error instanceof Error && error.message === RETURN_REASON_REQUIRED) {
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

      const scanNormalizedOutcome = normalizeItemResult("ROUTE", payload.result ?? "EN_RUTA");
      const scanMissingContract = foundItem.card.hasContract && !foundItem.card.contractImageAt;
      if (
        scanMissingContract &&
        scanNormalizedOutcome === "ACUSE_RECIBIDO" &&
        !payload.confirmMissingContract
      ) {
        return NextResponse.json(
          {
            error: "La tarjeta requiere contrato firmado; confirma para continuar sin el",
            kind: SIN_CONTRATO_REQUIERE_CONFIRMACION,
            candidates: [toCandidate(foundItem)],
          },
          { status: 409 },
        );
      }

      try {
        const outcome = await prisma.$transaction((tx) =>
          applyItemOutcome({
            tx,
            domain: "ROUTE",
            itemId: foundItem.id,
            result: payload.result ?? "EN_RUTA",
            comentario: payload.comentario,
            byUserId: auth.session.user.id,
            requireOpenCard: !payload.confirmClosed,
            deliveredWithoutContract: scanMissingContract,
          }),
        );
        await flushTransitionObservations([outcome.observation]);

        return NextResponse.json({
          scanned: {
            itemId: foundItem.id,
            tc: foundItem.card.tc,
            cedula: foundItem.card.customer.cedula,
            nombre: foundItem.card.customer.nombre,
          },
          itemId: outcome.itemId,
          cardId: outcome.cardId,
          routeId: outcome.routeId,
          routeStatus: outcome.routeStatus,
        });
      } catch (error) {
        if (error instanceof Error && error.message === RETURN_REASON_REQUIRED) {
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
