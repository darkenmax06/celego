/**
 * Golden rule of card identity: a TC may only be dispatched again once its
 * previous dispatch is closed. "Closed" means RETORNADA (the return frees the
 * TC) or ENTREGADA (the TC is done and must never be dispatched again).
 *
 * Historical data predates that rule being enforced, so a return could be
 * silently overwritten by a later PUESTA_EN_RUTA / ENTREGADA belonging to a
 * different physical dispatch. This module classifies those violations from
 * the card rows plus their status log, without touching the database.
 */

export const TERMINAL_CARD_STATUSES = ["ENTREGADA", "RETORNADA"] as const;

export type TcIntegrityStatusLog = {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: Date;
};

export type TcIntegrityCard = {
  id: string;
  tc: string;
  status: string;
  returnReason: string | null;
  currentMessengerId: string | null;
  dispatchDate: Date | null;
  createdAt: Date;
  logs: TcIntegrityStatusLog[];
};

export type TcIntegrityViolationKind =
  /** The card was RETORNADA and a later transition moved it out of that state. */
  | "OVERWRITTEN_RETURN"
  /** More than one card for the same TC is currently open. */
  | "MULTIPLE_OPEN_CARDS"
  /** An older dispatch of a TC never reached a terminal status. */
  | "OPEN_PREDECESSOR";

export type TcIntegrityViolation = {
  kind: TcIntegrityViolationKind;
  tc: string;
  cardIds: string[];
  detail: string;
  /** Populated only when the fix is unambiguous. */
  repair?: TcIntegrityRepair;
};

export type TcIntegrityRepair = {
  cardId: string;
  toStatus: "RETORNADA";
  returnReason: string | null;
  /** Timestamp of the return that was overwritten, for the audit note. */
  returnedAt: Date;
};

export function isTerminalStatus(status: string) {
  return (TERMINAL_CARD_STATUSES as readonly string[]).includes(status.trim().toUpperCase());
}

function timestamp(value: Date | null) {
  return value ? value.getTime() : Number.NEGATIVE_INFINITY;
}

/** Newest dispatch first: dispatchDate, then createdAt, then id as a tiebreak. */
export function compareDispatchRecency(left: TcIntegrityCard, right: TcIntegrityCard) {
  const byDispatch = timestamp(right.dispatchDate) - timestamp(left.dispatchDate);
  if (byDispatch !== 0) return byDispatch;
  const byCreated = right.createdAt.getTime() - left.createdAt.getTime();
  if (byCreated !== 0) return byCreated;
  return left.id.localeCompare(right.id);
}

function sortedLogs(card: TcIntegrityCard) {
  return [...card.logs].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

/**
 * The last RETORNADA in the card's history that was later moved out of.
 * Returns null when the card was never returned, or is still returned.
 */
export function findOverwrittenReturn(card: TcIntegrityCard) {
  if (card.status.trim().toUpperCase() === "RETORNADA") return null;

  const logs = sortedLogs(card);
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];
    if (log.toStatus !== "RETORNADA") continue;
    const overwrittenBy = logs.slice(index + 1).find((next) => next.toStatus !== "RETORNADA");
    if (!overwrittenBy) return null;
    return { returnLog: log, overwrittenBy };
  }
  return null;
}

/**
 * Classify every violation of the golden rule for one TC group.
 *
 * A repair is proposed only for an overwritten return on a card that is NOT
 * the newest dispatch of its TC: there the intent is unambiguous — the old
 * dispatch was returned, and the later activity belongs to the new one.
 */
export function analyzeTcGroup(tc: string, cards: readonly TcIntegrityCard[]): TcIntegrityViolation[] {
  const ordered = [...cards].sort(compareDispatchRecency);
  const violations: TcIntegrityViolation[] = [];

  for (const [index, card] of ordered.entries()) {
    const overwritten = findOverwrittenReturn(card);
    if (!overwritten) continue;

    const isNewestDispatch = index === 0;
    violations.push({
      kind: "OVERWRITTEN_RETURN",
      tc,
      cardIds: [card.id],
      detail: `retornada el ${overwritten.returnLog.createdAt.toISOString()} y sobrescrita a ${overwritten.overwrittenBy.toStatus} el ${overwritten.overwrittenBy.createdAt.toISOString()} (estado actual ${card.status})`,
      repair: isNewestDispatch
        ? undefined
        : {
            cardId: card.id,
            toStatus: "RETORNADA",
            returnReason: card.returnReason ?? overwritten.returnLog.note ?? null,
            returnedAt: overwritten.returnLog.createdAt,
          },
    });
  }

  const openCards = ordered.filter((card) => !isTerminalStatus(card.status));
  if (openCards.length > 1) {
    violations.push({
      kind: "MULTIPLE_OPEN_CARDS",
      tc,
      cardIds: openCards.map((card) => card.id),
      detail: `${openCards.length} tarjetas abiertas para el mismo TC (${openCards.map((card) => card.status).join(", ")})`,
    });
  }

  const openPredecessors = ordered.slice(1).filter((card) => !isTerminalStatus(card.status));
  if (ordered.length > 1 && openPredecessors.length) {
    violations.push({
      kind: "OPEN_PREDECESSOR",
      tc,
      cardIds: openPredecessors.map((card) => card.id),
      detail: `despachos anteriores sin cerrar: ${openPredecessors.map((card) => `${card.id}=${card.status}`).join(", ")}`,
    });
  }

  return violations;
}

export function analyzeCards(cards: readonly TcIntegrityCard[]) {
  const byTc = new Map<string, TcIntegrityCard[]>();
  for (const card of cards) {
    const key = card.tc.trim();
    const group = byTc.get(key);
    if (group) group.push(card);
    else byTc.set(key, [card]);
  }

  return Array.from(byTc.entries()).flatMap(([tc, group]) => analyzeTcGroup(tc, group));
}

/**
 * Guard state implied by the repaired history: ENTREGADA locks the TC forever,
 * a single open card owns it, and a fully returned TC is free again.
 */
export function expectedTcGuard(cards: readonly TcIntegrityCard[]) {
  const delivered = cards.find((card) => card.status.trim().toUpperCase() === "ENTREGADA");
  if (delivered) return { activeCardId: null, deliveredCardId: delivered.id };

  const open = [...cards].filter((card) => !isTerminalStatus(card.status)).sort(compareDispatchRecency);
  return { activeCardId: open[0]?.id ?? null, deliveredCardId: null };
}
