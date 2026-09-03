/**
 * Static allowlist of `CardStatus` transition edges.
 *
 * SDD change `rutas-lotes-redesign` — Slice 4a, pulled forward from Phase 6
 * (task 5.2). `lib/item-outcome-service.ts` (task 4.2) is this change's
 * FIRST live `CardTransitionPolicy` call site (spec: "CardTransitionPolicy
 * runs SHADOW-only") and needs something to evaluate against from the start,
 * even though the handler wiring itself (Slice 4b) and the dedicated
 * observer/SHADOW rollout (Slice 5, tasks 5.3-5.5) land in later batches.
 *
 * NOT seeded from `scripts/derive-card-transitions.ts` output on production
 * `CardStatusLog` data (design decision D5) — task 5.1, like task 1.0, is
 * BLOCKED: no live/production database access is permitted for this SDD
 * executor. The allowlist below is therefore deliberately minimal, same
 * defensive posture as `LotStatus` (Slice 3, see its doc comment in
 * `prisma/schema.prisma`): only edges DIRECTLY confirmed either by a
 * PASSING (non-throwing, committing) case in Slice 1's golden suite
 * (`tests/golden/route-lot-outcome-characterization.test.ts`) or by the
 * unconditional, fromStatus-independent assignment logic in the two
 * creation handlers (`POST /api/rutas`, `POST /api/lotes`) are declared
 * ALLOWED.
 *
 * This is a documented STARTING POINT, not a claim about which transitions
 * are actually legitimate in production. `evaluateEdge()` reporting an edge
 * as `UNLISTED_EDGE` never blocks a write in this change — SHADOW mode
 * (the only mode any call site of this module runs under so far) only logs
 * it, so the real edge set can be observed from `AuditLog` and used to widen
 * this table before any future ENFORCE proposal (design Rollout, Slice 5).
 */

/** Deliberately a plain string, not an `@prisma/client` enum import — keeps this module zero-I/O and importable under the node vitest environment without a generated client. */
export type GraphCardStatus = string;

/** `from: null` marks a genesis edge — route/lot creation, no prior CardStatus to compare against. */
export type CardTransitionEdge = { from: GraphCardStatus | null; to: GraphCardStatus };

export type EdgeEvaluation = {
  allowed: boolean;
  edge: CardTransitionEdge;
  reason: "ALLOWED" | "UNLISTED_EDGE";
};

const ALLOWED_EDGES: readonly CardTransitionEdge[] = [
  // applyItemResult / applyLotItemResult (PATCH UPDATE_ITEM_RESULT, SCAN_ITEM):
  // EN_RUTA is the only fromStatus a PASSING Slice-1 characterization case
  // ever exercised for a write that actually committed.
  { from: "EN_RUTA", to: "EN_RUTA" },
  { from: "EN_RUTA", to: "ACUSE_RECIBIDO" },
  { from: "EN_RUTA", to: "DEVUELTA_TIENDA" },
  // POST /api/rutas (route creation): unconditionally assigns EN_RUTA to
  // every selected card regardless of its prior status (only closed cards
  // are excluded before the write, which is a selection filter, not an
  // edge constraint) — modeled as a genesis edge.
  { from: null, to: "EN_RUTA" },
  // POST /api/lotes (lot creation): unconditionally assigns ENVIADA_INTERIOR
  // to every assigned card, same genesis reasoning.
  { from: null, to: "ENVIADA_INTERIOR" },
  // SDD contrato-tarjetas-pistoleo (design D7): advisory edges for the two
  // new contract-exception statuses. SHADOW-only, never enforced — these
  // exist so the audit signal stays clean once the new write paths land.
  { from: "EN_RUTA", to: "ENTREGA_SIN_CONTRATO" },
  { from: "ENTREGA_SIN_CONTRATO", to: "ACUSE_RECIBIDO" },
  { from: "ENTREGA_DIGITAL_SIN_CONTRATO", to: "ENTREGA_DIGITAL" },
  // SDD solicitudes-reclamaciones-urgentes (design D5): advisory edges for
  // the new EN_PROCESO_DE_RETORNO status. SHADOW-only, never enforced.
  { from: "EN_RUTA", to: "EN_PROCESO_DE_RETORNO" },
  { from: "ENTREGA_DIGITAL", to: "EN_PROCESO_DE_RETORNO" },
  { from: "EN_PROCESO_DE_RETORNO", to: "RETORNADA" },
  { from: "EN_PROCESO_DE_RETORNO", to: "DEVUELTA_TIENDA" },
  { from: "EN_PROCESO_DE_RETORNO", to: "EN_RUTA" },
];

function edgeKey(from: GraphCardStatus | null, to: GraphCardStatus): string {
  return `${from ?? ""}|${to}`;
}

const ALLOWED_EDGE_KEYS = new Set(ALLOWED_EDGES.map((edge) => edgeKey(edge.from, edge.to)));

/** Reports whether `(from, to)` is on the documented allowlist. Never throws, never blocks — purely informational. */
export function evaluateEdge(from: GraphCardStatus | null, to: GraphCardStatus): EdgeEvaluation {
  const allowed = ALLOWED_EDGE_KEYS.has(edgeKey(from, to));
  return {
    allowed,
    edge: { from, to },
    reason: allowed ? "ALLOWED" : "UNLISTED_EDGE",
  };
}

/** Returns the full allowlist, for tooling/reporting. A fresh array each call — callers must not mutate the shared table. */
export function listAllowedEdges(): CardTransitionEdge[] {
  return ALLOWED_EDGES.map((edge) => ({ ...edge }));
}
