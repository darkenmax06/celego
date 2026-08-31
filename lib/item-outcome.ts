/**
 * Pure result -> outcome -> CardStatus mapping, note-prefix builder, and
 * log-condition predicate shared by `applyItemResult` (rutas) and
 * `applyLotItemResult` (lotes).
 *
 * SDD change `rutas-lotes-redesign` — Slice 4a (task 4.1).
 *
 * Deliberately PURE: no Prisma import, no I/O. This lets `lib/item-outcome-service.ts`
 * (the tx-bound, impure caller — Slice 4a, task 4.2) delegate every branching
 * decision here and stay a thin orchestration layer, mirroring the existing
 * `lib/card-transition-policy.ts` (pure) / `lib/card-transition-policy-store.ts`
 * (Prisma-bound) split.
 *
 * Every literal string/condition below is pinned to the CURRENT behavior of
 * `applyItemResult` (app/api/rutas/route.ts) and `applyLotItemResult`
 * (app/api/lotes/route.ts), characterized by Slice 1's golden suite
 * (`tests/golden/route-lot-outcome-characterization.test.ts`). Slice 4b will
 * delegate both handlers to `lib/item-outcome-service.ts`, which calls into
 * this module — the Slice-1 suite must still pass unchanged after that
 * refactor, so nothing here may silently rephrase the original text/logic.
 */

export type OutcomeDomain = "ROUTE" | "LOT";

export const ITEM_OUTCOME_VALUES = ["EN_RUTA", "ACUSE_RECIBIDO", "DEVUELTA_TIENDA"] as const;
export type ItemOutcomeValue = (typeof ITEM_OUTCOME_VALUES)[number];

/**
 * `RETURN_REASON_REQUIRED` is redeclared here (not imported from
 * `lib/card-transition.ts`) on purpose: importing that module would pull in
 * `@prisma/client` and `@/lib/urgent-alerts` (which imports the Prisma
 * singleton), breaking this module's zero-I/O purity. Both handlers today
 * already independently inline this same literal string via
 * `new Error("RETURN_REASON_REQUIRED")` — this is the first shared constant
 * for it, not a new value.
 */
export const RETURN_REASON_REQUIRED = "RETURN_REASON_REQUIRED";

const CLOSED_CARD_STATUSES = new Set(["RETORNADA", "DEVUELTA_TIENDA"]);

/** Mirrors the identical helper duplicated today in both `route.ts` handlers. */
export function isClosedCardStatus(status: string | null | undefined): boolean {
  return status != null && CLOSED_CARD_STATUSES.has(status);
}

/**
 * `normalizeRouteResult` (rutas) and `normalizeLotResult` (lotes), unified
 * behind one domain-tagged pure function. Neither original function
 * considers the item's PRIOR status — only the requested `result` value —
 * so this stays a straight lookup with no fromStatus parameter.
 */
export function normalizeItemResult(domain: OutcomeDomain, result: string): ItemOutcomeValue {
  if (domain === "ROUTE") {
    if (result === "ENTREGADA" || result === "ACUSE_RECIBIDO") return "ACUSE_RECIBIDO";
    if (result === "RETORNADA" || result === "DEVUELTA_TIENDA") return "DEVUELTA_TIENDA";
    return "EN_RUTA";
  }
  // LOT
  if (result === "ACUSE_RECIBIDO" || result === "RECIBIDA") return "ACUSE_RECIBIDO";
  if (result === "DEVUELTA_TIENDA" || result === "RETORNADA") return "DEVUELTA_TIENDA";
  return "EN_RUTA";
}

/**
 * Today the three `ItemOutcomeValue` members share their literal name with
 * the `CardStatus` member they drive (`EN_RUTA`/`ACUSE_RECIBIDO`/`DEVUELTA_TIENDA`),
 * so this is currently an identity mapping. Kept as an explicit named
 * function (not a bare passthrough at the call site) so a future divergence
 * between the two enums is a one-line edit here, not a silent behavior
 * change wherever `nextStatus` is computed inline.
 */
export function outcomeToCardStatus(outcome: ItemOutcomeValue): string {
  return outcome;
}

/**
 * The exact `CardStatusLog` write-suppression predicate both handlers use
 * today (`lifecycleResult !== "EN_RUTA" || comentario || statusChanged`,
 * evaluated in different literal orders but logically identical in both
 * files). Deliberately checks the RAW `comentario` truthiness, NOT a
 * trimmed value: both handlers test `input.comentario` directly here (only
 * the separate `returnReason` resolution trims). A whitespace-only
 * comentario is therefore truthy and DOES trigger logging — matching that
 * exact (possibly accidental) current behavior verbatim, since Slice 4b
 * must delegate to this function with zero drift from Slice 1's
 * characterization suite.
 */
export function shouldLogOutcomeTransition(input: {
  outcome: ItemOutcomeValue;
  statusChanged: boolean;
  comentario?: string | null;
}): boolean {
  return input.outcome !== "EN_RUTA" || input.statusChanged || Boolean(input.comentario);
}

export type OutcomeNoteContext = {
  domain: OutcomeDomain;
  outcome: ItemOutcomeValue;
  comentario?: string | null;
  /** ROUTE only — required to render the `(ruta {routeId})` suffix. */
  routeId?: string;
  /** ROUTE only — omits the ` por mensajero {name}` clause when absent. */
  messengerName?: string | null;
  /** LOT only — required to render the `por lote {lotNumber}` suffix. */
  lotNumber?: string;
};

function routeNotePrefix(outcome: ItemOutcomeValue, messengerName?: string | null): string {
  const messengerInfo = messengerName ? ` por mensajero ${messengerName}` : "";
  if (outcome === "ACUSE_RECIBIDO") return `Acuse recibido${messengerInfo}`;
  if (outcome === "DEVUELTA_TIENDA") return `Tarjeta devuelta a tienda${messengerInfo}`;
  return "Actualizacion en ruta";
}

function lotNoteDefault(outcome: ItemOutcomeValue, lotNumber: string): string {
  if (outcome === "ACUSE_RECIBIDO") return `Acuse recibido por lote ${lotNumber}`;
  if (outcome === "DEVUELTA_TIENDA") return `Tarjeta devuelta a tienda por lote ${lotNumber}`;
  return `Actualizada por lote ${lotNumber}`;
}

/**
 * ROUTE and LOT combine `comentario` with the default text DIFFERENTLY —
 * this is a genuine behavioral difference in the current code, not an
 * inconsistency to fix:
 *  - ROUTE: `${prefix}: ${comentario}` when a comentario is given, else
 *    `${prefix} (ruta {routeId})`.
 *  - LOT: the raw comentario VERBATIM (no prefix at all) when given, else
 *    the lote-number-suffixed default.
 *
 * Deliberately uses the RAW `context.comentario` (not trimmed) for both the
 * truthiness check and the embedded text, matching both handlers' literal
 * `input.comentario ? ... : ...` / `input.comentario || ...` expressions —
 * a whitespace-only comentario is truthy and is embedded verbatim,
 * untrimmed. Only `resolveReturnReason` (a separate concern) trims.
 */
export function buildOutcomeNote(context: OutcomeNoteContext): string {
  const comentario = context.comentario ?? "";

  if (context.domain === "ROUTE") {
    const prefix = routeNotePrefix(context.outcome, context.messengerName);
    return comentario ? `${prefix}: ${comentario}` : `${prefix} (ruta ${context.routeId ?? ""})`;
  }

  const lotNumber = context.lotNumber ?? "";
  return comentario || lotNoteDefault(context.outcome, lotNumber);
}

/**
 * The `trimmedComment || fallbackReason || null` resolution both handlers
 * perform identically before deciding `Card.returnReason`.
 */
export function resolveReturnReason(input: {
  comentario?: string | null;
  cardReturnReason?: string | null;
}): string | null {
  const trimmedComment = input.comentario?.trim();
  const fallbackReason = input.cardReturnReason?.trim();
  return trimmedComment || fallbackReason || null;
}

/** Throws the exact `RETURN_REASON_REQUIRED` identifier both handlers throw today. */
export function assertReturnReasonPresent(outcome: ItemOutcomeValue, returnReason: string | null): void {
  if (outcome === "DEVUELTA_TIENDA" && !returnReason) {
    throw new Error(RETURN_REASON_REQUIRED);
  }
}
