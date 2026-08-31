import { NextRequest, NextResponse } from "next/server";
import { CardStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { buildListEnvelope, compile } from "@/lib/list-query";
import { lotesListQuery } from "@/lib/list-query/descriptors/lotes";
import { prisma } from "@/lib/prisma";
import {
  findOperationalCardCandidates,
  resolveOperationalIdentifier,
  type OperationalCard,
} from "@/lib/operational-card-service";
import { resolveZone } from "@/lib/zone-map";
import { mapLotStatus } from "@/lib/lot-status";
import { RETURN_REASON_REQUIRED } from "@/lib/item-outcome";
import {
  applyItemOutcome,
  CARD_CLOSED_REQUIRES_CONFIRMATION,
  LOT_ITEM_NOT_FOUND,
} from "@/lib/item-outcome-service";
import { emitTransitionObservations, type TransitionObservation } from "@/lib/card-transition-observer";

const createSchema = z.object({
  messengerId: z.string().cuid(),
  sentTo: z.string().min(2),
  fechaEnvio: z.string(),
  fechaRetorno: z.string().optional().nullable(),
  estatus: z.string().min(1).default("EN TRANSITO"),
  notas: z.string().optional(),
  identifiers: z.array(z.string().min(1)).min(1),
});

const lotResultSchema = z.enum([
  "ACUSE_RECIBIDO",
  "DEVUELTA_TIENDA",
  "EN_RUTA",
  "RECIBIDA",
  "RETORNADA",
  "PENDIENTE",
]);

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE_ITEM_RESULT"),
    lotItemId: z.string().cuid(),
    result: lotResultSchema,
    comentario: z.string().optional(),
  }),
  z.object({
    action: z.literal("SCAN_ITEM"),
    lotId: z.string().cuid(),
    identifier: z.string().min(1),
    itemId: z.string().cuid().optional(),
    confirmClosed: z.boolean().optional(),
    result: lotResultSchema.default("ACUSE_RECIBIDO"),
    comentario: z.string().optional(),
  }),
  z.object({
    action: z.literal("UPDATE_LOT_STATUS"),
    lotId: z.string().cuid(),
    estatus: z.string().min(1),
    fechaRetorno: z.string().optional().nullable(),
    notas: z.string().optional(),
  }),
]);

function toTruthyValue(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized === "SI" || normalized === "YES" || normalized === "TRUE" || normalized === "1";
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const CLOSED_CARD_STATUSES = [CardStatus.RETORNADA, CardStatus.DEVUELTA_TIENDA] as const;
const CARD_ASSIGNMENT_CLOSED = "CARD_ASSIGNMENT_CLOSED";

function isClosedCardStatus(status: CardStatus | string | null | undefined) {
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

async function generateLotNumber(fechaEnvio: Date) {
  const y = fechaEnvio.getFullYear();
  const m = String(fechaEnvio.getMonth() + 1).padStart(2, "0");
  const d = String(fechaEnvio.getDate()).padStart(2, "0");
  const prefix = `LOTE-${y}${m}${d}`;

  const last = await prisma.lot.findFirst({
    where: { lotNumber: { startsWith: `${prefix}-` } },
    orderBy: { lotNumber: "desc" },
    select: { lotNumber: true },
  });

  const nextSeq = last?.lotNumber
    ? (Number(last.lotNumber.split("-").pop() ?? "0") || 0) + 1
    : 1;
  return `${prefix}-${String(nextSeq).padStart(3, "0")}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  // `status` keeps its free-string + "ALL" sentinel semantics and `date` stays a
  // SINGLE param expanded to [start, start + 1 day). No search, no sort: the
  // route never had either.
  const query = compile(lotesListQuery, request.nextUrl.searchParams);
  const where: Prisma.LotWhereInput = query.where;

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      include: {
        items: {
          include: {
            card: { include: { customer: true } },
          },
        },
      },
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    }),
    prisma.lot.count({ where }),
  ]);

  const rows = lots.map((lot) => {
    const total = lot.items.length;
    const routeResult = (item: typeof lot.items[number]) => {
      const root = asRecord(item.card?.metadata);
      const route = asRecord(root.route);
      return typeof route.result === "string" ? route.result : "";
    };
    const recibidas = lot.items.filter(
      (item) => toTruthyValue(item.recibida) || routeResult(item) === "ACUSE_RECIBIDO",
    ).length;
    const retornadas = lot.items.filter(
      (item) => toTruthyValue(item.retornada) || routeResult(item) === "DEVUELTA_TIENDA",
    ).length;
    return {
      ...lot,
      stats: {
        total,
        recibidas,
        retornadas,
        pendientes: Math.max(0, total - recibidas - retornadas),
      },
    };
  });

  return NextResponse.json({
    lots: rows,
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

  const identifiers = (parsed.data.identifiers ?? [])
    .map((identifier) => identifier.trim())
    .filter(Boolean);
  const uniqueIdentifiers = [...new Set(identifiers)];
  const fechaEnvio = new Date(parsed.data.fechaEnvio);
  if (Number.isNaN(fechaEnvio.getTime())) {
    return NextResponse.json({ error: "fechaEnvio invalida" }, { status: 400 });
  }

  const [messenger, cards, provinceConfigs, lotNumber] = await Promise.all([
    prisma.messenger.findUnique({ where: { id: parsed.data.messengerId } }),
    findOperationalCardCandidates(uniqueIdentifiers),
    prisma.provinceConfig.findMany({ where: { active: true }, select: { nombre: true, zona: true } }),
    generateLotNumber(fechaEnvio),
  ]);

  if (!messenger) {
    return NextResponse.json({ error: "Mensajero no encontrado" }, { status: 404 });
  }

  const provinceToZone = new Map(provinceConfigs.map((row) => [normalizeKey(row.nombre), row.zona]));
  const sentTo = parsed.data.sentTo.trim();
  const zoneForDestination =
    provinceToZone.get(normalizeKey(sentTo)) ?? resolveZone(sentTo, "Metro");

  const usedCardIds = new Set<string>();
  const cardByIdentifier = new Map<string, OperationalCard | null>();
  const conflicts: Array<{
    identifier: string;
    kind: "REQUIERE_SELECCION" | "SOLO_CERRADAS";
    cards: OperationalCard[];
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
      cardByIdentifier.set(identifier, resolution.card);
    } else {
      cardByIdentifier.set(identifier, null);
    }
  }

  if (conflicts.length) {
    return NextResponse.json(
      {
        error: "Hay tarjetas que requieren seleccion o confirmacion antes de crear el lote",
        conflicts,
      },
      { status: 409 },
    );
  }

  const assignedCards = Array.from(
    new Map(
      Array.from(cardByIdentifier.values())
        .filter((card): card is OperationalCard => Boolean(card))
        .map((card) => [card.id, card]),
    ).values(),
  );

  try {
    const lot = await prisma.$transaction(async (tx) => {
      if (assignedCards.length) {
        const assigned = await tx.card.updateMany({
          where: {
            id: { in: assignedCards.map((card) => card.id) },
            status: { notIn: [...CLOSED_CARD_STATUSES] },
          },
          data: {
            status: CardStatus.ENVIADA_INTERIOR,
            provincia: sentTo,
            zona: zoneForDestination,
            currentMessengerId: messenger.id,
            lastAssignedMessengerId: messenger.id,
          },
        });

        if (assigned.count !== assignedCards.length) {
          throw new Error(CARD_ASSIGNMENT_CLOSED);
        }
      }

      const created = await tx.lot.create({
        data: {
          lotNumber,
          enviadoA: messenger.nombre,
          sentTo,
          fechaEnvio,
          fechaRetorno: parsed.data.fechaRetorno ? new Date(parsed.data.fechaRetorno) : null,
          estatus: parsed.data.estatus,
          estatusTipo: mapLotStatus(parsed.data.estatus),
          notas: parsed.data.notas,
          items: {
            create: uniqueIdentifiers.map((identifier) => {
              const card = cardByIdentifier.get(identifier) ?? null;

              return {
                cardId: card?.id,
                tc: card?.tc ?? identifier,
                cedula: card?.customer.cedula ?? null,
                telefono: card?.customer.telefonosRaw ?? null,
              };
            }),
          },
        },
        include: {
          items: {
            include: { card: { include: { customer: true } } },
          },
        },
      });

      if (assignedCards.length) {
        await tx.cardStatusLog.createMany({
          data: assignedCards.map((card) => ({
            cardId: card.id,
            fromStatus: card.status,
            toStatus: CardStatus.ENVIADA_INTERIOR,
            note: "Enviada a interior en lote " + lotNumber + " (" + messenger.nombre + ")",
            byUserId: auth.session.user.id,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          entity: "LOT",
          entityId: created.id,
          action: "CREATE",
          userId: auth.session.user.id,
          details: {
            lotNumber: created.lotNumber,
            items: created.items.length,
            messengerId: messenger.id,
            sentTo,
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    return NextResponse.json({ lot }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === CARD_ASSIGNMENT_CLOSED) {
      return NextResponse.json(
        {
          error:
            "Una o mas tarjetas fueron retornadas o devueltas mientras se creaba el lote. Recarga y selecciona tarjetas vigentes.",
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
    case "UPDATE_ITEM_RESULT": {
      try {
        const outcome = await prisma.$transaction((tx) =>
          applyItemOutcome({
            tx,
            domain: "LOT",
            itemId: payload.lotItemId,
            result: payload.result,
            comentario: payload.comentario,
            byUserId: auth.session.user.id,
          }),
        );
        await flushTransitionObservations([outcome.observation]);
        return NextResponse.json({
          updated: true,
          itemId: outcome.itemId,
          lotId: outcome.lotId,
          tc: outcome.tc,
        });
      } catch (error) {
        if (error instanceof Error && error.message === LOT_ITEM_NOT_FOUND) {
          return NextResponse.json({ error: "Item de lote no encontrado" }, { status: 404 });
        }
        if (error instanceof Error && error.message === RETURN_REASON_REQUIRED) {
          return NextResponse.json(
            { error: "Motivo de devolucion requerido para marcar tarjeta devuelta a tienda" },
            { status: 400 },
          );
        }
        throw error;
      }
    }
    case "SCAN_ITEM": {
      const lot = await prisma.lot.findUnique({
        where: { id: payload.lotId },
        include: { items: { include: { card: { include: { customer: true } } } } },
      });
      if (!lot) {
        return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
      }

      const identifier = payload.identifier.trim();
      const toCandidate = (row: (typeof lot.items)[number]) => ({
        itemId: row.id,
        cardId: row.cardId,
        tc: row.tc,
        cedula: row.cedula,
        nombre: row.card?.customer.nombre ?? null,
        status: row.card?.status ?? null,
        dispatchDate: row.card?.dispatchDate ?? null,
        returnReason: row.card?.returnReason ?? null,
      });
      const conflict = (
        kind: "REQUIERE_SELECCION" | "SOLO_CERRADAS",
        items: readonly (typeof lot.items)[number][],
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

      let item: (typeof lot.items)[number] | undefined;
      if (payload.itemId) {
        const explicitItems = lot.items.filter((row) => row.id === payload.itemId);
        if (!explicitItems.length) {
          return NextResponse.json({ error: "Item de lote no encontrado" }, { status: 404 });
        }
        item = explicitItems[0];
      } else {
        const explicitItemMatches = lot.items.filter(
          (row) => row.id === identifier || row.cardId === identifier,
        );
        if (explicitItemMatches.length > 1) {
          return conflict("REQUIERE_SELECCION", explicitItemMatches);
        }
        if (explicitItemMatches.length === 1) {
          item = explicitItemMatches[0];
        } else {
          const linkedItems = lot.items.filter(
            (
              row,
            ): row is (typeof lot.items)[number] & {
              card: NonNullable<(typeof lot.items)[number]["card"]>;
            } => Boolean(row.card),
          );
          const resolution = resolveOperationalIdentifier(
            identifier,
            linkedItems.map((row) => row.card),
          );
          if (resolution.kind === "REQUIERE_SELECCION") {
            return conflict(
              resolution.kind,
              linkedItems.filter((row) =>
                resolution.options.some((card) => card.id === row.card.id),
              ),
            );
          }
          if (resolution.kind === "SOLO_CERRADAS") {
            return conflict(
              resolution.kind,
              linkedItems.filter((row) =>
                resolution.closedCards.some((card) => card.id === row.card.id),
              ),
            );
          }
          if (resolution.kind === "RESUELTA") {
            const resolvedItems = linkedItems.filter((row) => row.card.id === resolution.card.id);
            if (resolvedItems.length > 1) {
              return conflict("REQUIERE_SELECCION", resolvedItems);
            }
            item = resolvedItems[0];
          } else {
            const digits = identifier.replace(/\D/g, "");
            const unlinkedMatches = lot.items.filter(
              (row) =>
                !row.cardId &&
                (row.tc === identifier ||
                  row.cedula === identifier ||
                  (row.cedula?.replace(/\D/g, "") === digits && digits.length > 0)),
            );
            if (unlinkedMatches.length > 1) {
              return conflict("REQUIERE_SELECCION", unlinkedMatches);
            }
            item = unlinkedMatches[0];
          }
        }
      }
      if (!item) {
        return NextResponse.json({ error: "Tarjeta no encontrada en lote" }, { status: 404 });
      }

      if (isClosedCardStatus(item.card?.status) && !payload.confirmClosed) {
        return conflict("SOLO_CERRADAS", [item]);
      }

      try {
        const outcome = await prisma.$transaction((tx) =>
          applyItemOutcome({
            tx,
            domain: "LOT",
            itemId: item.id,
            result: payload.result,
            comentario: payload.comentario,
            byUserId: auth.session.user.id,
            requireOpenCard: !payload.confirmClosed,
          }),
        );
        await flushTransitionObservations([outcome.observation]);

        return NextResponse.json({
          scanned: { itemId: item.id, tc: item.tc, cedula: item.cedula },
          itemId: outcome.itemId,
          lotId: outcome.lotId,
          tc: outcome.tc,
        });
      } catch (error) {
        if (error instanceof Error && error.message === RETURN_REASON_REQUIRED) {
          return NextResponse.json(
            { error: "Motivo de devolucion requerido para marcar tarjeta devuelta a tienda" },
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
    case "UPDATE_LOT_STATUS": {
      const lot = await prisma.lot.update({
        where: { id: payload.lotId },
        data: {
          estatus: payload.estatus,
          estatusTipo: mapLotStatus(payload.estatus),
          fechaRetorno: payload.fechaRetorno ? new Date(payload.fechaRetorno) : null,
          notas: payload.notas,
        },
      });
      return NextResponse.json({ lot });
    }
  }
}
