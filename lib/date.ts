import { format } from "date-fns";

export function formatDateEs(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd/MM/yyyy");
}

function fromPartsAsLocalDate(year: number, month: number, day: number) {
  // Use noon to avoid timezone edge cases moving the date to the previous day.
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseExcelSerialDate(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return fromPartsAsLocalDate(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3]),
      );
    }

    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      return fromPartsAsLocalDate(
        Number(slashMatch[3]),
        Number(slashMatch[1]),
        Number(slashMatch[2]),
      );
    }

    if (/^\d{8}$/.test(trimmed)) {
      const m = Number(trimmed.slice(0, 2));
      const d = Number(trimmed.slice(2, 4));
      const y = Number(trimmed.slice(4, 8));
      return fromPartsAsLocalDate(y, m, d);
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return null;

  // Excel serial day 1 is 1900-01-01; using 1899-12-30 keeps compatibility with leap-year bug.
  const wholeDays = Math.floor(serial);
  const excelEpochUtc = Date.UTC(1899, 11, 30);
  const utcDate = new Date(excelEpochUtc + wholeDays * 24 * 60 * 60 * 1000);
  if (Number.isNaN(utcDate.getTime())) return null;

  return fromPartsAsLocalDate(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate(),
  );
}
