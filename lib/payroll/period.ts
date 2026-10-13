/**
 * Payroll days are Dominican calendar days (UTC-4, no daylight saving) stored as
 * midnight UTC of that date, the same convention as route days.
 */
const DR_OFFSET_MS = 4 * 60 * 60 * 1000;

export function dayKey(instant: Date) {
  return new Date(instant.getTime() - DR_OFFSET_MS).toISOString().slice(0, 10);
}

export function dayFromKey(key: string) {
  const day = new Date(`${key}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(day.getTime())) throw new Error(`Dia invalido: ${key}`);
  return day;
}

/** The payroll day an instant belongs to, as midnight UTC. */
export function payrollDay(instant: Date) {
  return dayFromKey(dayKey(instant));
}

/** Every payroll day from `from` to `to`, inclusive. */
export function eachDay(from: Date, to: Date) {
  const days: Date[] = [];
  for (let time = from.getTime(); time <= to.getTime(); time += 24 * 60 * 60 * 1000) days.push(new Date(time));
  return days;
}

export type PeriodLike = {
  id: string;
  fromDate: Date;
  toDate: Date;
  messengerId: string | null;
};

/**
 * Period that governs a messenger on a day: the messenger's own period when it
 * has one covering the day, otherwise the general one. null = no cut defined yet.
 */
export function findPeriod<T extends PeriodLike>(periods: T[], messengerId: string, day: Date): T | null {
  const time = day.getTime();
  const covers = (period: T) => period.fromDate.getTime() <= time && time <= period.toDate.getTime();
  return (
    periods.find((period) => period.messengerId === messengerId && covers(period)) ??
    periods.find((period) => period.messengerId === null && covers(period)) ??
    null
  );
}

/** Two periods of the same scope (same messenger, or both general) must not overlap. */
export function periodsOverlap(a: Pick<PeriodLike, "fromDate" | "toDate">, b: Pick<PeriodLike, "fromDate" | "toDate">) {
  return a.fromDate.getTime() <= b.toDate.getTime() && b.fromDate.getTime() <= a.toDate.getTime();
}

/** Accepts a plain `yyyy-mm-dd` day or a full timestamp and returns the payroll day. */
export function toPayrollDay(raw: string) {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return dayFromKey(trimmed);
  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) throw new Error(`Fecha invalida: ${raw}`);
  return payrollDay(instant);
}
