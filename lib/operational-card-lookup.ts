/**
 * Smallest Card shape required to make an operational selection.  Prisma Card
 * records (with `customer.cedula` selected) satisfy this shape directly, and
 * callers with flattened data can instead provide `customerCedula`.
 */
export type OperationalCardCandidate = {
  id: string;
  tc: string;
  externalReference?: string | null;
  status: string;
  dispatchDate?: Date | string | null;
  createdAt: Date | string;
  customer?: {
    cedula?: string | null;
  } | null;
  customerCedula?: string | null;
  returnReason?: string | null;
};

export type OperationalCardMatchKind = "TC" | "REFERENCIA" | "CEDULA";

export type OperationalCardLookup = {
  kind: OperationalCardMatchKind;
  value: string;
};

/**
 * Build the identity scope for a daily card import. A missing dispatch date
 * deliberately means `NULL`, never an omitted filter that could match an
 * older instance of the same TC.
 */
export function buildDailyImportCardLookup(input: {
  tc: string;
  productType?: CardProductType;
  customerId: string;
  dispatchDate: Date | null | undefined;
}) {
  return {
    tc: input.tc,
    ...(input.productType ? { productType: input.productType } : {}),
    customerId: input.customerId,
    dispatchDate: input.dispatchDate ?? null,
  };
}

export const OPERATIONAL_CLOSED_CARD_STATUSES = [
  "RETORNADA",
  "DEVUELTA_TIENDA",
] as const;

export type OperationalCardResolution<T extends OperationalCardCandidate> =
  | {
      kind: "RESUELTA";
      card: T;
    }
  | {
      kind: "REQUIERE_SELECCION";
      options: T[];
    }
  | {
      kind: "SOLO_CERRADAS";
      closedCards: T[];
    }
  | {
      kind: "NO_ENCONTRADA";
    };

function normalizeIdentifier(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s\-_]+/g, "")
    .trim()
    .toUpperCase();
}

function normalizeCedula(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits || normalizeIdentifier(value);
}

function cardCedula(card: OperationalCardCandidate) {
  return card.customerCedula ?? card.customer?.cedula ?? "";
}

export function isOperationalCardClosed(status: string) {
  const normalizedStatus = status.trim().toUpperCase();
  return (OPERATIONAL_CLOSED_CARD_STATUSES as readonly string[]).includes(normalizedStatus);
}

function isClosedForOperationalLookup(card: OperationalCardCandidate) {
  return isOperationalCardClosed(card.status);
}

function dateTimestamp(value: Date | string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function compareTimestampDescending(left: number, right: number) {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

/**
 * Newest operational dispatch first. `updatedAt` is deliberately not part of
 * this order: an update to a historical return must never make it win a scan.
 */
export function compareOperationalCardRecency(
  left: OperationalCardCandidate,
  right: OperationalCardCandidate,
) {
  const byDispatchDate = compareTimestampDescending(
    dateTimestamp(left.dispatchDate),
    dateTimestamp(right.dispatchDate),
  );
  if (byDispatchDate !== 0) return byDispatchDate;

  const byCreatedAt = compareTimestampDescending(
    dateTimestamp(left.createdAt),
    dateTimestamp(right.createdAt),
  );
  if (byCreatedAt !== 0) return byCreatedAt;

  return left.id.localeCompare(right.id);
}

function matchesLookup(card: OperationalCardCandidate, lookup: OperationalCardLookup) {
  switch (lookup.kind) {
    case "TC": {
      const value = normalizeIdentifier(lookup.value);
      return Boolean(value) && normalizeIdentifier(card.tc) === value;
    }
    case "REFERENCIA": {
      const value = normalizeIdentifier(lookup.value);
      return Boolean(value) && normalizeIdentifier(card.externalReference ?? "") === value;
    }
    case "CEDULA": {
      const value = normalizeCedula(lookup.value);
      return Boolean(value) && normalizeCedula(cardCedula(card)) === value;
    }
  }
}

function latestCardForEachTc<T extends OperationalCardCandidate>(cards: readonly T[]) {
  const latestByTc = new Map<string, T>();

  for (const card of cards) {
    const tcKey = normalizeIdentifier(card.tc) || `CARD:${card.id}`;
    if (!latestByTc.has(tcKey)) latestByTc.set(tcKey, card);
  }

  return Array.from(latestByTc.values()).sort(compareOperationalCardRecency);
}

/**
 * Resolve a card for an operational mutation without hiding historical data.
 *
 * Direct TC/reference scans pick the latest non-returned instance. A cédula
 * scan only resolves automatically when it has one current TC; otherwise the
 * caller must ask the operator to choose from `options`.
 */
export function resolveOperationalCardLookup<T extends OperationalCardCandidate>(
  lookup: OperationalCardLookup,
  candidates: readonly T[],
): OperationalCardResolution<T> {
  const matched = candidates
    .filter((card) => matchesLookup(card, lookup))
    .sort(compareOperationalCardRecency);

  if (!matched.length) return { kind: "NO_ENCONTRADA" };

  const openCards = matched.filter((card) => !isClosedForOperationalLookup(card));
  if (!openCards.length) {
    return {
      kind: "SOLO_CERRADAS",
      closedCards: matched,
    };
  }

  if (lookup.kind !== "CEDULA") {
    return {
      kind: "RESUELTA",
      card: openCards[0],
    };
  }

  const options = latestCardForEachTc(openCards);
  if (options.length === 1) {
    return {
      kind: "RESUELTA",
      card: options[0],
    };
  }

  return {
    kind: "REQUIERE_SELECCION",
    options,
  };
}
import type { CardProductType } from "@prisma/client";
