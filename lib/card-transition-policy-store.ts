/**
 * Prisma binding for the card transition enforcement switch.
 *
 * Keeps the Prisma import out of `lib/card-transition-policy.ts` so the pure
 * parsing and caching logic stays unit testable under the node vitest
 * environment.
 */
import { prisma } from "@/lib/prisma";
import {
  createCardTransitionPolicyCache,
  DEFAULT_CARD_TRANSITION_POLICY_MODE,
  parseCardTransitionPolicyMode,
  type CardTransitionPolicyMode,
} from "@/lib/card-transition-policy";

export const CARD_TRANSITION_POLICY_ID = "default";

/**
 * Reads the singleton row, bypassing the cache. An absent row resolves to
 * SHADOW; the row is not created here so a read can never write.
 */
export async function readCardTransitionPolicyMode(): Promise<CardTransitionPolicyMode> {
  const row = await prisma.cardTransitionPolicy.findUnique({
    where: { id: CARD_TRANSITION_POLICY_ID },
    select: { mode: true },
  });
  return parseCardTransitionPolicyMode(row);
}

const cache = createCardTransitionPolicyCache({ load: readCardTransitionPolicyMode });

/**
 * Current enforcement mode, read through a 30 second in-process cache.
 * Falls back to SHADOW when the row is absent or unreadable.
 */
export async function getCardTransitionPolicyMode(): Promise<CardTransitionPolicyMode> {
  return cache.get();
}

/** Drops the cached mode so the next read hits the database. */
export function invalidateCardTransitionPolicyCache(): void {
  cache.invalidate();
}

/**
 * Writes the switch and invalidates the cache immediately, so a rollback to OFF
 * takes effect on this instance without waiting out the cache window.
 */
export async function setCardTransitionPolicyMode(
  mode: CardTransitionPolicyMode,
  updatedById?: string | null,
): Promise<CardTransitionPolicyMode> {
  const row = await prisma.cardTransitionPolicy.upsert({
    where: { id: CARD_TRANSITION_POLICY_ID },
    update: { mode, updatedById: updatedById ?? null },
    create: { id: CARD_TRANSITION_POLICY_ID, mode, updatedById: updatedById ?? null },
    select: { mode: true },
  });
  invalidateCardTransitionPolicyCache();
  return parseCardTransitionPolicyMode(row);
}

/**
 * Ensures the singleton row exists at the safe default. Never downgrades or
 * overwrites an operator's chosen mode.
 */
export async function ensureCardTransitionPolicy(): Promise<void> {
  await prisma.cardTransitionPolicy.upsert({
    where: { id: CARD_TRANSITION_POLICY_ID },
    update: {},
    create: {
      id: CARD_TRANSITION_POLICY_ID,
      mode: DEFAULT_CARD_TRANSITION_POLICY_MODE,
    },
  });
}
