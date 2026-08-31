/**
 * Enforcement switch for the card status transition graph.
 *
 * This module is deliberately PURE: it imports no Prisma client, so it can be
 * unit tested under the node vitest environment with relative imports. The
 * Prisma-backed singleton row lives in `lib/card-transition-policy-store.ts`.
 *
 * The switch is a database row rather than an environment variable on purpose:
 * the deploy is a single container started by `docker-entrypoint.sh`, so an env
 * var rollback would require a restart and therefore downtime. A row rolls back
 * with `UPDATE "CardTransitionPolicy" SET mode = 'OFF'` and takes effect within
 * one cache window, with no restart at all.
 */

/**
 * The three defined states.
 *
 * - `OFF`     — the graph is not consulted; every write behaves exactly as it
 *               does today, with side effects unchanged and nothing recorded.
 * - `SHADOW`  — the graph is consulted and violations are recorded, but no
 *               write is ever rejected. This is the default.
 * - `ENFORCE` — the graph is consulted and an invalid edge is rejected.
 */
export const CARD_TRANSITION_POLICY_MODES = ["OFF", "SHADOW", "ENFORCE"] as const;

export type CardTransitionPolicyMode = (typeof CARD_TRANSITION_POLICY_MODES)[number];

/**
 * Default when the singleton row is absent, unreadable, or holds a value this
 * build does not recognise. SHADOW observes without rejecting anything, so it is
 * the only safe default: it can never break a flow that works today.
 */
export const DEFAULT_CARD_TRANSITION_POLICY_MODE: CardTransitionPolicyMode = "SHADOW";

/** How long a resolved mode is reused before the row is read again. */
export const CARD_TRANSITION_POLICY_CACHE_TTL_MS = 30_000;

export function isCardTransitionPolicyMode(value: unknown): value is CardTransitionPolicyMode {
  return (
    typeof value === "string" &&
    (CARD_TRANSITION_POLICY_MODES as readonly string[]).includes(value)
  );
}

/**
 * Resolve the mode from a stored row. An absent row, a null row, or a value this
 * build does not know about all resolve to SHADOW rather than throwing, because
 * the enforcement switch must never be the thing that breaks a card write.
 */
export function parseCardTransitionPolicyMode(row: unknown): CardTransitionPolicyMode {
  if (!row || typeof row !== "object") return DEFAULT_CARD_TRANSITION_POLICY_MODE;
  const mode = (row as { mode?: unknown }).mode;
  return isCardTransitionPolicyMode(mode) ? mode : DEFAULT_CARD_TRANSITION_POLICY_MODE;
}

export type CardTransitionPolicyCacheOptions = {
  /** Reads the current mode from its backing store. */
  readonly load: () => Promise<CardTransitionPolicyMode>;
  /** Injectable clock; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Injectable time to live; defaults to 30 seconds. */
  readonly ttlMs?: number;
};

export type CardTransitionPolicyCache = {
  /** Current mode, reading through the backing store at most once per window. */
  get: () => Promise<CardTransitionPolicyMode>;
  /** Drops the cached value so the very next `get` reads the store again. */
  invalidate: () => void;
};

/**
 * A single-entry, time-to-live cache over the policy row.
 *
 * Concurrent reads share one in-flight load. A failing load resolves to SHADOW
 * and is NOT cached, so a transient database error does not pin the switch for a
 * whole window.
 */
export function createCardTransitionPolicyCache(
  options: CardTransitionPolicyCacheOptions,
): CardTransitionPolicyCache {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? CARD_TRANSITION_POLICY_CACHE_TTL_MS;

  let cachedMode: CardTransitionPolicyMode | null = null;
  let cachedAt = 0;
  let inFlight: Promise<CardTransitionPolicyMode> | null = null;

  async function refresh(): Promise<CardTransitionPolicyMode> {
    try {
      const mode = await options.load();
      cachedMode = mode;
      cachedAt = now();
      return mode;
    } catch {
      cachedMode = null;
      return DEFAULT_CARD_TRANSITION_POLICY_MODE;
    } finally {
      inFlight = null;
    }
  }

  return {
    async get() {
      if (cachedMode !== null && now() - cachedAt < ttlMs) return cachedMode;
      inFlight ??= refresh();
      return inFlight;
    },
    invalidate() {
      cachedMode = null;
      cachedAt = 0;
    },
  };
}
