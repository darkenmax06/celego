/**
 * Shared, transaction-bound governed write for a card's item outcome —
 * ROUTE (`RouteItem`) and LOT (`LotItem`) domains.
 *
 * SDD change `rutas-lotes-redesign` — Slice 4a (task 4.2).
 *
 * NOT wired into any handler in this batch. `applyItemResult`
 * (app/api/rutas/route.ts) and `applyLotItemResult` (app/api/lotes/route.ts)
 * keep their current inline logic untouched; Slice 4b replaces each
 * handler's body with a call to `applyItemOutcome()` here and re-runs Slice
 * 1's characterization suite unchanged to prove parity. This module exists
 * now, fully tested in isolation (`tests/item-outcome-service.test.ts`), so
 * that delegation is a small, low-risk diff.
 *
 * Delegates all card-status side effects to `lib/card-transition.ts::applyCardTransition()`,
 * which already performs `Card.update`, `syncTcGuardForTransition`
 * (`CardTcGuard` upsert on terminal statuses), `clearUrgencyOnCardClosure`,
 * and the conditional `CardStatusLog` write — this service does NOT
 * duplicate any of those, it only computes the domain-specific inputs
 * (`nextStatus`, `note`, `returnReason`, `data`) and performs the
 * item-specific typed/legacy column writes each handler already does today.
 *
 * Design's two deliberate, accepted behavior deltas versus the current
 * handlers (both come from routing through `applyCardTransition`, not from
 * anything this file adds on top):
 *  1. `CardTcGuard` now upserts on a terminal-status transition — neither
 *     handler does this today; `applyCardTransition` always has.
 *  2. `note` is passed to `applyCardTransition` ONLY when
 *     `shouldLogOutcomeTransition()` holds (never `alwaysLog: true`), so the
 *     legacy log-suppression condition is preserved exactly instead of
 *     silently widening it.
 *
 * `CardTransitionPolicy` (SHADOW-mode observation) — this is THIS CHANGE'S
 * FIRST live call site for it (spec: "CardTransitionPolicy runs
 * SHADOW-only"). The observation is BUILT here, inside the transaction
 * (pure, via `buildTransitionObservation`), and returned on the result for
 * the FUTURE caller to flush with `emitTransitionObservations()` AFTER the
 * transaction commits (design decision D3) — this module never calls
 * `emitTransitionObservations()` itself, and never rejects a write based on
 * policy evaluation in any mode (design Testing Strategy: "ENFORCE never
 * rejects in this change").
 */
import type { Prisma, RouteStatus } from "@prisma/client";
import { applyCardTransition } from "@/lib/card-transition";
import { getCardTransitionPolicyMode } from "@/lib/card-transition-policy-store";
import { buildTransitionObservation, type TransitionObservation } from "@/lib/card-transition-observer";
import {
  assertReturnReasonPresent,
  buildOutcomeNote,
  isClosedCardStatus,
  normalizeItemResult,
  outcomeToCardStatus,
  resolveReturnReason,
  shouldLogOutcomeTransition,
  type ItemOutcomeValue,
  type OutcomeDomain,
} from "@/lib/item-outcome";

export type { OutcomeDomain };

export const ITEM_NOT_FOUND = "ITEM_NOT_FOUND";
export const LOT_ITEM_NOT_FOUND = "LOT_ITEM_NOT_FOUND";
export const CARD_CLOSED_REQUIRES_CONFIRMATION = "CARD_CLOSED_REQUIRES_CONFIRMATION";

export type ApplyItemOutcomeInput = {
  tx: Prisma.TransactionClient;
  domain: OutcomeDomain;
  itemId: string;
  result: string;
  comentario?: string;
  byUserId?: string;
  requireOpenCard?: boolean;
  /**
   * SDD contrato-tarjetas-pistoleo (design D3). ROUTE domain only. When
   * `true` AND the normalized outcome is `ACUSE_RECIBIDO`, the card-status
   * write diverges to `ENTREGA_SIN_CONTRATO` instead of `ACUSE_RECIBIDO`.
   * `RouteItem.outcome` and `lib/item-outcome.ts::outcomeToCardStatus` stay
   * untouched — only `nextStatus` diverges, here in the caller.
   */
  deliveredWithoutContract?: boolean;
};

export type ApplyItemOutcomeResult = {
  itemId: string;
  cardId: string | null;
  routeId?: string;
  lotId?: string;
  /**
   * LOT domain only — echoes `LotItem.tc`, mirroring `applyLotItemResult`'s
   * legacy response shape (`{ itemId, lotId, tc }`). Not part of the design's
   * original shared interface (LOT-only field, not a card-transition
   * concern) — added in Slice 4b once the handler delegation needed it to
   * keep the PATCH response byte-identical. See item-outcome-service.ts's
   * module doc comment, deviation #5 from the Slice 4a apply-progress note.
   */
  tc?: string;
  routeStatus?: RouteStatus;
  outcome: ItemOutcomeValue;
  observation: TransitionObservation | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Verbatim copy of `applyItemResult`'s module-private `recalculateRouteStatus` (app/api/rutas/route.ts). */
async function recalculateRouteStatus(
  tx: Prisma.TransactionClient,
  routeId: string,
): Promise<RouteStatus> {
  const items = await tx.routeItem.findMany({ where: { routeId }, select: { checkedAt: true } });
  if (!items.length) return "PENDIENTE" as RouteStatus;

  const allChecked = items.every((item) => Boolean(item.checkedAt));
  const anyChecked = items.some((item) => Boolean(item.checkedAt));
  const nextStatus = (allChecked ? "COMPLETADA" : anyChecked ? "EN_PROCESO" : "PENDIENTE") as RouteStatus;

  await tx.route.update({ where: { id: routeId }, data: { status: nextStatus } });
  return nextStatus;
}

async function buildObservation(input: {
  domain: OutcomeDomain;
  itemId: string;
  cardId: string;
  from: string;
  to: string;
  byUserId?: string;
}): Promise<TransitionObservation | null> {
  const mode = await getCardTransitionPolicyMode();
  return buildTransitionObservation({
    domain: input.domain,
    itemId: input.itemId,
    cardId: input.cardId,
    from: input.from,
    to: input.to,
    mode,
    byUserId: input.byUserId,
  });
}

async function applyRouteItemOutcome(input: ApplyItemOutcomeInput): Promise<ApplyItemOutcomeResult> {
  const { tx } = input;
  const item = await tx.routeItem.findUnique({
    where: { id: input.itemId },
    include: { card: true, route: { include: { messenger: true } } },
  });
  if (!item) throw new Error(ITEM_NOT_FOUND);

  if (input.requireOpenCard && isClosedCardStatus(item.card.status)) {
    throw new Error(CARD_CLOSED_REQUIRES_CONFIRMATION);
  }

  const outcome = normalizeItemResult("ROUTE", input.result);
  const shouldSetChecked = outcome !== "EN_RUTA";
  const returnReason = resolveReturnReason({
    comentario: input.comentario,
    cardReturnReason: item.card.returnReason,
  });
  assertReturnReasonPresent(outcome, returnReason);

  // SDD contrato-tarjetas-pistoleo (design D3): diverge ONLY the card-status
  // write, ONLY for the delivered outcome. `RouteItem.outcome` keeps writing
  // the normalized `ACUSE_RECIBIDO` value below unchanged.
  const nextStatus =
    input.deliveredWithoutContract && outcome === "ACUSE_RECIBIDO"
      ? "ENTREGA_SIN_CONTRATO"
      : outcomeToCardStatus(outcome);
  const statusChanged = item.card.status !== nextStatus;
  const trimmedComment = input.comentario?.trim();

  await tx.routeItem.update({
    where: { id: item.id },
    data: {
      checkedAt: shouldSetChecked ? new Date() : null,
      outcome,
      outcomeReason: outcome === "DEVUELTA_TIENDA" ? returnReason : null,
      outcomeAt: new Date(),
    },
  });

  const metadataRoot = asRecord(item.card.metadata);
  const existingRoute = asRecord(metadataRoot.route);
  const routePayload: Record<string, unknown> = {
    ...existingRoute,
    result: outcome,
    comentario: outcome === "DEVUELTA_TIENDA" ? (returnReason ?? "") : (trimmedComment ?? ""),
    routeId: item.routeId,
    messengerId: item.route.messengerId,
    updatedAt: new Date().toISOString(),
  };

  const shouldLog = shouldLogOutcomeTransition({ outcome, statusChanged, comentario: input.comentario });
  const isContractException = nextStatus === "ENTREGA_SIN_CONTRATO";
  const note = shouldLog
    ? buildOutcomeNote({
        domain: "ROUTE",
        outcome,
        comentario: input.comentario,
        routeId: item.routeId,
        messengerName: item.route.messenger?.nombre ?? null,
      }) + (isContractException ? " (sin contrato)" : "")
    : null;

  await applyCardTransition({
    tx,
    card: {
      id: item.card.id,
      tc: item.card.tc,
      status: item.card.status,
      returnReason: item.card.returnReason,
      digitalDeliveryCycle: item.card.digitalDeliveryCycle,
    },
    nextStatus: nextStatus as never,
    byUserId: input.byUserId,
    note,
    returnReason: outcome === "DEVUELTA_TIENDA" ? returnReason : null,
    data: {
      currentMessengerId: item.route.messengerId,
      metadata: { ...metadataRoot, route: routePayload } as Prisma.InputJsonValue,
    },
  });

  const routeStatus = await recalculateRouteStatus(tx, item.routeId);

  const observation = await buildObservation({
    domain: "ROUTE",
    itemId: item.id,
    cardId: item.cardId,
    from: item.card.status,
    to: nextStatus,
    byUserId: input.byUserId,
  });

  return {
    itemId: item.id,
    cardId: item.cardId,
    routeId: item.routeId,
    routeStatus,
    outcome,
    observation,
  };
}

async function applyLotItemOutcome(input: ApplyItemOutcomeInput): Promise<ApplyItemOutcomeResult> {
  const { tx } = input;
  const item = await tx.lotItem.findUnique({
    where: { id: input.itemId },
    include: { card: true, lot: true },
  });
  if (!item) throw new Error(LOT_ITEM_NOT_FOUND);

  if (input.requireOpenCard && isClosedCardStatus(item.card?.status)) {
    throw new Error(CARD_CLOSED_REQUIRES_CONFIRMATION);
  }

  const outcome = normalizeItemResult("LOT", input.result);
  const nextRecibida = outcome === "ACUSE_RECIBIDO" ? "SI" : null;
  const nextRetornada = outcome === "DEVUELTA_TIENDA" ? "SI" : null;
  const returnReason = resolveReturnReason({
    comentario: input.comentario,
    cardReturnReason: item.card?.returnReason,
  });
  assertReturnReasonPresent(outcome, returnReason);

  const now = new Date();
  const nextRecibidaAt = outcome === "ACUSE_RECIBIDO" ? now : null;
  const nextRetornadaAt = outcome === "DEVUELTA_TIENDA" ? now : null;

  await tx.lotItem.update({
    where: { id: item.id },
    data: {
      recibida: nextRecibida,
      retornada: nextRetornada,
      recibidaAt: nextRecibidaAt,
      retornadaAt: nextRetornadaAt,
      outcome,
      outcomeReason: outcome === "DEVUELTA_TIENDA" ? returnReason : null,
    },
  });

  let observation: TransitionObservation | null = null;

  // Mirrors `applyLotItemResult`'s `if (item.cardId && item.card)` guard: a
  // LotItem's `cardId` is optional, and when it is unset there is no card
  // transition to apply at all — only the LotItem row itself is written.
  if (item.cardId && item.card) {
    const nextStatus = outcomeToCardStatus(outcome);
    const statusChanged = item.card.status !== nextStatus;
    const shouldLog = shouldLogOutcomeTransition({ outcome, statusChanged, comentario: input.comentario });
    const note = shouldLog
      ? buildOutcomeNote({
          domain: "LOT",
          outcome,
          comentario: input.comentario,
          lotNumber: item.lot.lotNumber,
        })
      : null;

    const metadataRoot = asRecord(item.card.metadata);
    const routeMeta = asRecord(metadataRoot.route);

    await applyCardTransition({
      tx,
      card: {
        id: item.card.id,
        tc: item.card.tc,
        status: item.card.status,
        returnReason: item.card.returnReason,
        digitalDeliveryCycle: item.card.digitalDeliveryCycle,
      },
      nextStatus: nextStatus as never,
      byUserId: input.byUserId,
      note,
      returnReason: outcome === "DEVUELTA_TIENDA" ? returnReason : null,
      data: {
        currentMessengerId: item.card.currentMessengerId,
        metadata: {
          ...metadataRoot,
          route: {
            ...routeMeta,
            result: outcome,
            comentario: returnReason ?? "",
            lotId: item.lotId,
            updatedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });

    observation = await buildObservation({
      domain: "LOT",
      itemId: item.id,
      cardId: item.cardId,
      from: item.card.status,
      to: nextStatus,
      byUserId: input.byUserId,
    });
  }

  return {
    itemId: item.id,
    cardId: item.cardId ?? null,
    lotId: item.lotId,
    tc: item.tc,
    outcome,
    observation,
  };
}

/**
 * Applies a card item outcome for either domain, tx-bound. See the module
 * doc comment above for the full behavior contract. Error identifiers are
 * preserved verbatim from the current handlers: `ITEM_NOT_FOUND`,
 * `LOT_ITEM_NOT_FOUND`, `CARD_CLOSED_REQUIRES_CONFIRMATION`,
 * `RETURN_REASON_REQUIRED` (thrown by `lib/item-outcome.ts::assertReturnReasonPresent`).
 */
export async function applyItemOutcome(input: ApplyItemOutcomeInput): Promise<ApplyItemOutcomeResult> {
  if (input.domain === "ROUTE") return applyRouteItemOutcome(input);
  return applyLotItemOutcome(input);
}
