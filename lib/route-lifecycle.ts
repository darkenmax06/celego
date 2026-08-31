/**
 * Server-side dual-read for an item's outcome: typed column first, legacy
 * `Card.metadata.route.result` JSON fallback, `"EN_RUTA"` default.
 *
 * SDD change `rutas-lotes-redesign` — Slice 4a (task 4.3).
 *
 * Design decision D1: the new typed `outcome` columns
 * (`RouteItem.outcome`/`LotItem.outcome`, Slice 3) are the source of truth;
 * `Card.metadata.route.*` remains a dual-write mirror because the mobile
 * proof-evidence path (`app/api/mobile/rutas/pruebas/route.ts`) writes it
 * independently and is out of scope for this change. Reads MUST therefore
 * prefer the typed column and only fall back to JSON for rows written before
 * the typed columns existed (spec: "Dual-read with legacy fallback").
 *
 * Deliberately PURE and domain-agnostic: no Prisma import, no I/O. Both
 * `RouteItem` and `LotItem` write the identical `metadata.route.result`
 * shape (`applyItemResult`/`applyLotItemResult` both merge into
 * `Card.metadata.route`), so one dual-read function correctly serves both
 * domains — this is the "Lot side's equivalent read logic" this batch's
 * scope calls out, satisfied by domain-agnostic design rather than a second
 * copy.
 *
 * Reuses `readRouteResultFromMetadata` from `lib/route-item-lifecycle.ts`
 * (Slice 2) for the JSON-fallback branch instead of re-walking
 * `metadata.route.result` a third time. `lib/route-item-lifecycle.ts`'s own
 * `getRouteLifecycle` (JSON-only, no typed-column awareness) is UNCHANGED
 * and keeps serving the existing client-side route-progress panel — this
 * module is additive, not a replacement, per this batch's explicit
 * instruction to split responsibilities rather than silently duplicate the
 * JSON-parsing branch.
 */
import { readRouteResultFromMetadata, type RouteLifecycleLabel } from "@/lib/route-item-lifecycle";
import { ITEM_OUTCOME_VALUES, type ItemOutcomeValue } from "@/lib/item-outcome";

const KNOWN_OUTCOMES: readonly string[] = ITEM_OUTCOME_VALUES;

function isKnownOutcome(value: unknown): value is ItemOutcomeValue {
  return typeof value === "string" && KNOWN_OUTCOMES.includes(value);
}

/**
 * Typed column wins when it holds a recognized `ItemOutcomeValue`. Falls
 * back to `metadata.route.result` (via `readRouteResultFromMetadata`, itself
 * already defaulting to `"EN_RUTA"`) when the typed column is null,
 * undefined, or (defensively) an unrecognized value.
 */
export function resolveItemOutcome(
  typedOutcome: ItemOutcomeValue | string | null | undefined,
  metadata: unknown,
): ItemOutcomeValue {
  if (isKnownOutcome(typedOutcome)) return typedOutcome;

  const raw = readRouteResultFromMetadata(metadata);
  return isKnownOutcome(raw) ? raw : "EN_RUTA";
}

/** Same Spanish display labels `lib/route-item-lifecycle.ts::getRouteLifecycle` already renders. */
export function outcomeDisplayLabel(outcome: ItemOutcomeValue): RouteLifecycleLabel {
  if (outcome === "ACUSE_RECIBIDO") return "ACUSE RECIBIDO";
  if (outcome === "DEVUELTA_TIENDA") return "DEVUELTA A TIENDA";
  return "EN RUTA";
}

/**
 * Convenience combining both steps for an item shaped like either a
 * `RouteItem` or a `LotItem` include (`{ outcome, card: { metadata } }`).
 */
export function resolveItemLifecycleLabel(item: {
  outcome?: ItemOutcomeValue | string | null;
  card: { metadata: unknown };
}): RouteLifecycleLabel {
  return outcomeDisplayLabel(resolveItemOutcome(item.outcome, item.card.metadata));
}
