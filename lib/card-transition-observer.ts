/**
 * Builds and flushes SHADOW-mode `CardTransitionPolicy` observations.
 *
 * SDD change `rutas-lotes-redesign` — Slice 4a, pulled forward from Phase 6
 * (task 5.3), because `lib/item-outcome-service.ts` (task 4.2) is this
 * change's FIRST live `CardTransitionPolicy` call site and needs somewhere
 * to hand its observation to, even though handler wiring (Slice 4b) and the
 * dedicated SHADOW rollout tests (Slice 5, tasks 5.4-5.5) land later.
 *
 * Design decision D3 (mandatory split): `buildTransitionObservation` is PURE
 * and side-effect-free — it is meant to be called INSIDE a transaction,
 * where all the inputs are already at hand. `emitTransitionObservations` is
 * the impure flush — it MUST be called AFTER the transaction commits, never
 * from inside it. A statement failing inside a Postgres transaction aborts
 * the WHOLE transaction even if the JS error around it is caught, so writing
 * the audit row inside the tx could turn a harmless policy-logging failure
 * into a broken operator write. Post-commit is the only truly non-blocking
 * option — this is why the two functions are split instead of one
 * "observe-and-write" call.
 *
 * Design decision D4 (mandatory sink): observations go to `AuditLog` via
 * `tryWriteAuditEvent` (`lib/audit.ts`), never to `CardStatusLog`.
 * `CardStatusLog` is the transition audit trail `scripts/derive-card-transitions.ts`
 * reads to derive the empirical edge set a future ENFORCE decision depends
 * on; SHADOW violation rows written there would poison that evidence.
 *
 * `tryWriteAuditEvent` already swallows and logs its own errors (see
 * `lib/audit.ts`), which is exactly the "never throws into the request"
 * behavior spec scenario "Policy error does not block write" requires — this
 * module does not need to re-implement that isolation itself.
 */
import type { Prisma } from "@prisma/client";
import { tryWriteAuditEvent } from "@/lib/audit";
import { evaluateEdge, type EdgeEvaluation } from "@/lib/card-transition-graph";
import type { OutcomeDomain } from "@/lib/item-outcome";

/**
 * Mirrors `CardTransitionPolicyMode` from `lib/card-transition-policy.ts`
 * structurally (not imported) so this module stays decoupled from that
 * module's own dependency surface; the values are the same three literals.
 */
export type ObservedPolicyMode = "OFF" | "SHADOW" | "ENFORCE";

export type TransitionObservation = {
  domain: OutcomeDomain;
  itemId: string;
  cardId: string;
  edge: { from: string | null; to: string };
  mode: ObservedPolicyMode;
  evaluation: EdgeEvaluation;
  byUserId?: string;
  observedAt: string;
};

export type BuildTransitionObservationInput = {
  domain: OutcomeDomain;
  itemId: string;
  cardId: string;
  from: string | null;
  to: string;
  mode: ObservedPolicyMode;
  byUserId?: string;
  /** Injectable clock for deterministic tests; defaults to `() => new Date()`. */
  now?: () => Date;
};

/**
 * Pure. Returns `null` when there is nothing worth recording:
 *  - `mode === "OFF"` — the policy is not consulted at all (spec scenario
 *    "OFF mode emits nothing").
 *  - the edge is on the allowlist — a listed edge needs no audit noise.
 *
 * Otherwise returns a fully-formed observation, regardless of whether `mode`
 * is `SHADOW` or `ENFORCE` — this change never rejects a write over policy
 * (design Testing Strategy: "ENFORCE never rejects in this change"), it only
 * varies whether an observation carries `SHADOW` or `ENFORCE` as its
 * recorded mode for later analysis.
 */
export function buildTransitionObservation(
  input: BuildTransitionObservationInput,
): TransitionObservation | null {
  if (input.mode === "OFF") return null;

  const evaluation = evaluateEdge(input.from, input.to);
  if (evaluation.allowed) return null;

  const now = input.now ?? (() => new Date());
  return {
    domain: input.domain,
    itemId: input.itemId,
    cardId: input.cardId,
    edge: { from: input.from, to: input.to },
    mode: input.mode,
    evaluation,
    byUserId: input.byUserId,
    observedAt: now().toISOString(),
  };
}

/**
 * Flushes zero or more observations to `AuditLog`, AFTER the transaction
 * that produced them has committed. Never throws — `tryWriteAuditEvent`
 * already catches and logs. Deliberately takes `(TransitionObservation | null)[]`
 * so a caller can pass its `applyItemOutcome()` results straight through
 * without pre-filtering.
 */
export async function emitTransitionObservations(
  observations: readonly (TransitionObservation | null | undefined)[],
): Promise<void> {
  const real = observations.filter((observation): observation is TransitionObservation =>
    Boolean(observation),
  );
  if (!real.length) return;

  await Promise.all(
    real.map((observation) =>
      tryWriteAuditEvent({
        entity: "CARD_TRANSITION",
        entityId: observation.cardId,
        action: "POLICY_SHADOW_VIOLATION",
        userId: observation.byUserId ?? null,
        details: {
          domain: observation.domain,
          itemId: observation.itemId,
          edge: observation.edge,
          mode: observation.mode,
          reason: observation.evaluation.reason,
          observedAt: observation.observedAt,
        } as Prisma.InputJsonValue,
      }),
    ),
  );
}
