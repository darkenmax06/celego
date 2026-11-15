import { addDays, format, isWeekend, startOfDay } from "date-fns";
import { remainingBusinessDays } from "@/lib/sla";

export type SlaAgingBucketKey = "d1to3" | "d4to7" | "d8plus";

export type SlaAgingBucket = {
  key: SlaAgingBucketKey;
  label: string;
  /** Business days overdue, inclusive; `max` is null for the open-ended bucket. */
  min: number;
  max: number | null;
  count: number;
  /** Inclusive local-day `slaDueDate` window of the bucket, for drilling into /sla-vencidas. */
  slaDueFrom: string | null;
  slaDueTo: string;
};

export type SlaPortfolio = {
  /** Open cards whose SLA is due today or later. */
  alDia: number;
  /** Open cards whose SLA was due before today. */
  vencidas: number;
  /** Open cards without an SLA due date. */
  sinSla: number;
  /** First day still "al día" (today), for drilling into /tarjetas. */
  today: string;
  buckets: SlaAgingBucket[];
};

const BUCKETS: Array<Pick<SlaAgingBucket, "key" | "label" | "min" | "max">> = [
  { key: "d1to3", label: "1-3 días", min: 1, max: 3 },
  { key: "d4to7", label: "4-7 días", min: 4, max: 7 },
  { key: "d8plus", label: "8+ días", min: 8, max: null },
];

function dayKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

/**
 * Business days a card is overdue, as /sla-vencidas shows them. A due date on
 * the weekend right before today still counts as one day: the card is overdue.
 */
export function businessDaysOverdue(today: Date, slaDueDate: Date) {
  return Math.max(1, -remainingBusinessDays(today, slaDueDate));
}

/** The n-th weekday counting back from `today` (n = 1 is the previous weekday). */
function nthWeekdayBefore(today: Date, n: number) {
  let cursor = startOfDay(today);
  let seen = 0;
  while (seen < n) {
    cursor = addDays(cursor, -1);
    if (!isWeekend(cursor)) seen += 1;
  }
  return cursor;
}

/**
 * Inclusive `slaDueDate` window whose cards are between `min` and `max`
 * business days overdue. The earliest day is the one right after the weekday
 * that would already be `max + 1` days overdue.
 */
export function slaDueWindow(today: Date, min: number, max: number | null): { from: string | null; to: string } {
  const to = min <= 1 ? addDays(startOfDay(today), -1) : nthWeekdayBefore(today, min);
  const from = max === null ? null : addDays(nthWeekdayBefore(today, max + 1), 1);
  return { from: from ? dayKey(from) : null, to: dayKey(to) };
}

/**
 * Splits open cards (closed statuses already excluded by the caller) into
 * "al día", "vencidas" and "sin SLA", and the overdue ones into aging buckets
 * by business days, so the buckets always add up to `vencidas`.
 */
export function buildSlaPortfolio(cards: Array<{ slaDueDate: Date | null }>, now: Date): SlaPortfolio {
  const today = startOfDay(now);
  const counts: Record<SlaAgingBucketKey, number> = { d1to3: 0, d4to7: 0, d8plus: 0 };
  let alDia = 0;
  let vencidas = 0;
  let sinSla = 0;

  for (const card of cards) {
    if (!card.slaDueDate) {
      sinSla += 1;
      continue;
    }
    if (card.slaDueDate.getTime() >= today.getTime()) {
      alDia += 1;
      continue;
    }
    vencidas += 1;
    const days = businessDaysOverdue(today, card.slaDueDate);
    const bucket = BUCKETS.find((item) => days >= item.min && (item.max === null || days <= item.max)) ?? BUCKETS[0];
    counts[bucket.key] += 1;
  }

  return {
    alDia,
    vencidas,
    sinSla,
    today: dayKey(today),
    buckets: BUCKETS.map((bucket) => {
      const window = slaDueWindow(today, bucket.min, bucket.max);
      return { ...bucket, count: counts[bucket.key], slaDueFrom: window.from, slaDueTo: window.to };
    }),
  };
}
