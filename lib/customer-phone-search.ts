import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneDigits } from "@/lib/phone";

const MIN_PHONE_SEARCH_DIGITS = 7;
const MAX_PHONE_SEARCH_DIGITS = 10;
const MAX_PHONE_MATCHES = 500;

/**
 * Digits worth matching against stored phones, or null when the query does not
 * look like a phone. An 11-digit number with country code 1 drops it, because
 * stored phones are mostly saved without it. Longer inputs (a TC) are skipped.
 */
export function phoneSearchDigits(query: string | null | undefined): string | null {
  if (!query) return null;
  const all = phoneDigits(query);
  const digits = all.length === 11 && all.startsWith("1") ? all.slice(1) : all;
  if (digits.length < MIN_PHONE_SEARCH_DIGITS || digits.length > MAX_PHONE_SEARCH_DIGITS) return null;
  return digits;
}

/**
 * `telefonosRaw` keeps each number in its original format ("809-555-1234 | 8095551234"),
 * so a plain `contains` misses formatted numbers. Postgres strips the non-digits
 * before matching.
 */
export async function findCustomerIdsByPhone(query: string | null | undefined): Promise<string[]> {
  const digits = phoneSearchDigits(query);
  if (!digits) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Customer"
    WHERE regexp_replace(COALESCE("telefonosRaw", ''), '[^0-9]', '', 'g') LIKE ${`%${digits}%`}
    LIMIT ${MAX_PHONE_MATCHES}`;
  return rows.map((row) => row.id);
}

/** Card clause to OR into a search, or null when no customer phone matches. */
export async function cardPhoneSearchClause(
  query: string | null | undefined,
): Promise<Prisma.CardWhereInput | null> {
  const ids = await findCustomerIdsByPhone(query);
  return ids.length ? { customerId: { in: ids } } : null;
}

/** `cardPhoneSearchClause` shaped for the list-query `searchOr` option. */
export async function cardPhoneSearchOr(query: string | null | undefined): Promise<Prisma.CardWhereInput[]> {
  const clause = await cardPhoneSearchClause(query);
  return clause ? [clause] : [];
}
