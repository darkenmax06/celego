import { isWeekend, addDays, startOfDay, differenceInCalendarDays } from "date-fns";

export function addBusinessDaysStrict(fromDate: Date, days: number): Date {
  let cursor = startOfDay(fromDate);
  let added = 0;
  while (added < days) {
    cursor = addDays(cursor, 1);
    if (!isWeekend(cursor)) {
      added += 1;
    }
  }
  return cursor;
}

export function businessDaysBetween(fromDate: Date, toDate: Date): number {
  const start = startOfDay(fromDate);
  const end = startOfDay(toDate);
  const dir = start <= end ? 1 : -1;
  let cursor = start;
  let count = 0;

  while (differenceInCalendarDays(cursor, end) !== 0) {
    cursor = addDays(cursor, dir);
    if (!isWeekend(cursor)) {
      count += dir;
    }
  }

  return count;
}

export function remainingBusinessDays(now: Date, dueDate: Date): number {
  return businessDaysBetween(now, dueDate);
}
