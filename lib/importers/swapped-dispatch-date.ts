const DAY_MS = 86_400_000;

/**
 * How far before the import a dispatch date may plausibly be. Daily files are
 * imported within 0-4 days of dispatch; a wider window let a swap one month back
 * (September 8th stored as August 9th) pass as plausible.
 */
export const DISPATCH_LOOKBACK_DAYS = 7;

function inImportWindow(date: Date, importedAt: Date) {
  const time = date.getTime();
  return time >= importedAt.getTime() - DISPATCH_LOOKBACK_DAYS * DAY_MS && time <= importedAt.getTime() + DAY_MS;
}

/**
 * Recovers a dispatch date stored with day and month swapped.
 *
 * Real Excel date cells used to reach the day-first credit parser as month-first
 * text, so "9/3/2026" (September 3rd) was stored as March 9th. The swap is only
 * reported when the stored date is implausible for the import time and the
 * swapped date is plausible, which keeps correctly dated rows untouched and
 * makes the correction idempotent.
 */
export function detectSwappedDispatchDate(stored: Date, importedAt: Date): Date | null {
  const day = stored.getUTCDate();
  const month = stored.getUTCMonth() + 1;
  if (day > 12 || day === month) return null;

  const candidate = new Date(Date.UTC(stored.getUTCFullYear(), day - 1, month, 12));
  if (candidate.getUTCMonth() !== day - 1 || candidate.getUTCDate() !== month) return null;

  return !inImportWindow(stored, importedAt) && inImportWindow(candidate, importedAt) ? candidate : null;
}
