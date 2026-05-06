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

function parseTwoOrFourDigitYear(rawYear: string) {
  const year = Number(rawYear);
  if (!Number.isFinite(year)) return null;
  if (rawYear.length === 4) return year;
  if (rawYear.length !== 2) return null;

  return year >= 50 ? 1900 + year : 2000 + year;
}

function parseExcelSerialNumber(serialValue: number) {
  const serial = Number(serialValue);
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

    const slashShortYearMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (slashShortYearMatch) {
      const year = parseTwoOrFourDigitYear(slashShortYearMatch[3]);
      if (year != null) {
        return fromPartsAsLocalDate(
          year,
          Number(slashShortYearMatch[1]),
          Number(slashShortYearMatch[2]),
        );
      }
    }

    if (/^\d{8}$/.test(trimmed)) {
      const m = Number(trimmed.slice(0, 2));
      const d = Number(trimmed.slice(2, 4));
      const y = Number(trimmed.slice(4, 8));
      return fromPartsAsLocalDate(y, m, d);
    }

    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const parsedSerial = parseExcelSerialNumber(Number(trimmed));
      if (parsedSerial) return parsedSerial;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;

    return fromPartsAsLocalDate(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth() + 1,
      parsed.getUTCDate(),
    );
  }

  return parseExcelSerialNumber(value);
}
