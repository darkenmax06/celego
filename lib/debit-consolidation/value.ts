import { createHash, randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import { normalizeText } from "@/lib/utils";
import type { WorkbookCellValue } from "./types";

export function normalizeWorkbookHeader(value: unknown) {
  return normalizeText(String(value ?? "")).replace(/\s+/g, " ");
}

export function normalizeStatusKey(value: unknown) {
  return normalizeWorkbookHeader(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

export function cellText(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export function parseWorkbookDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S));
  }
  const raw = cellText(value);
  if (!raw || /^0{1,2}:0{2}:0{2}(?:\s*[AP]M)?$/i.test(raw)) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const result = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4] ?? 0),
      Number(iso[5] ?? 0),
      Number(iso[6] ?? 0),
    );
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const local = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (local) {
    const result = new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isValidRequestNumber(value: string) {
  return /^4-\d{11}$/.test(value);
}

export function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function validationToken() {
  return randomBytes(32).toString("hex");
}

export function asSnapshot(
  headers: readonly string[],
  cells: readonly WorkbookCellValue[],
): Record<string, WorkbookCellValue> {
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null]));
}

export function workbookRows(buffer: Buffer, sheetName: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: false });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json<WorkbookCellValue[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

export function workbookSheetNames(buffer: Buffer) {
  return XLSX.read(buffer, { type: "buffer", bookSheets: true }).SheetNames;
}
