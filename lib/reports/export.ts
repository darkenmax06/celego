import ExcelJS from "exceljs";
import Papa from "papaparse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getCeleritasLogoPngBuffer } from "@/lib/reports/logo";

const DATE_FMT = "dd/mm/yyyy";
const DATETIME_FMT = "dd/mm/yyyy hh:mm";
// Dominican Republic has no DST, so a fixed offset turns UTC instants into local wall clock.
const DR_OFFSET_MS = -4 * 60 * 60 * 1000;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const YMD = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export type ExcelDate = { value: Date; numFmt: string };

function wallClock(y: number, m: number, d: number, h = 0, mi = 0, sec = 0): ExcelDate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  // ExcelJS writes dates from their UTC parts, so the wall clock is encoded as UTC.
  const value = new Date(Date.UTC(y, m - 1, d, h, mi, sec));
  if (value.getUTCDate() !== d) return null;
  return { value, numFmt: h || mi || sec ? DATETIME_FMT : DATE_FMT };
}

function fromInstant(date: Date): ExcelDate | null {
  if (Number.isNaN(date.getTime())) return null;
  // Calendar-only fields (dispatch, SLA, route days) are stored as midnight UTC: keep their day.
  const isDateOnly = date.getTime() % 86400000 === 0;
  const local = isDateOnly ? date : new Date(date.getTime() + DR_OFFSET_MS);
  return wallClock(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(),
    local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds());
}

/**
 * Turns a Date or a date-looking string (ISO, yyyy-mm-dd, or the day-first dd/mm/yyyy
 * used across Celego) into a real Excel date so Excel's date filters work.
 */
export function toExcelDate(value: unknown): ExcelDate | null {
  if (value instanceof Date) return fromInstant(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (ISO_INSTANT.test(text)) return fromInstant(new Date(text));
  const ymd = text.match(YMD);
  if (ymd) return wallClock(+ymd[1], +ymd[2], +ymd[3], +(ymd[4] ?? 0), +(ymd[5] ?? 0), +(ymd[6] ?? 0));
  const dmy = text.match(DMY);
  if (dmy) return wallClock(+dmy[3], +dmy[2], +dmy[1], +(dmy[4] ?? 0), +(dmy[5] ?? 0), +(dmy[6] ?? 0));
  return null;
}

/** Rewrites every date-looking cell of the given rows (from `fromRow` on) as a real Excel date. */
export function applyExcelDates(sheet: ExcelJS.Worksheet, fromRow = 2) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < fromRow) return;
    row.eachCell((cell) => {
      const date = toExcelDate(cell.value);
      if (!date) return;
      cell.value = date.value;
      cell.numFmt = date.numFmt;
    });
  });
}

function toXlsxCellValue(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

export async function exportRowsToXlsx(
  rows: Record<string, unknown>[],
  sheetName = "Reporte",
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  if (!headers.length) {
    sheet.addRow(["Sin datos para exportar"]);
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn(1).width = 28;
    return workbook.xlsx.writeBuffer();
  }

  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((h) => toXlsxCellValue(row[h])));
  }

  applyExcelDates(sheet);
  sheet.getRow(1).font = { bold: true };
  headers.forEach((header, index) => {
    let maxLen = String(header).length;
    for (const row of rows) {
      const value = toXlsxCellValue(row[header]);
      maxLen = Math.max(maxLen, String(value).length);
    }
    sheet.getColumn(index + 1).width = Math.max(12, Math.min(80, maxLen + 2));
  });

  return workbook.xlsx.writeBuffer();
}

export function exportRowsToCsv(rows: Record<string, unknown>[]) {
  return Papa.unparse(rows, { delimiter: "," });
}

export async function exportRowsToPdf(
  title: string,
  rows: Record<string, unknown>[],
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const logoBuffer = await getCeleritasLogoPngBuffer();
  const logoImage = logoBuffer ? await pdf.embedPng(logoBuffer).catch(() => null) : null;

  const rowsPerPage = 42;
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([612, 792]);
    const pageRows = rows.slice(
      pageIndex * rowsPerPage,
      (pageIndex + 1) * rowsPerPage,
    );

    if (logoImage) {
      page.drawImage(logoImage, {
        x: 612 - 40 - 130,
        y: 746,
        width: 130,
        height: 26,
      });
    }

    page.drawText(title, {
      x: 40,
      y: 756,
      size: 15,
      font: bold,
      color: rgb(0.04, 0.11, 0.21),
    });

    page.drawText(`Fecha: ${new Date().toLocaleDateString("es-DO")}`, {
      x: 40,
      y: 740,
      size: 8.5,
      font,
      color: rgb(0.4, 0.45, 0.5),
    });

    page.drawText(`Pagina ${pageIndex + 1} de ${pageCount}`, {
      x: 612 - 40 - 70,
      y: 732,
      size: 8,
      font,
      color: rgb(0.45, 0.5, 0.55),
    });

    page.drawLine({
      start: { x: 40, y: 726 },
      end: { x: 612 - 40, y: 726 },
      thickness: 0.75,
      color: rgb(0.85, 0.88, 0.92),
    });

    let y = 710;
    const lineHeight = 13;

    if (headers.length) {
      page.drawText(headers.join("  |  ").slice(0, 115), {
        x: 40,
        y,
        size: 7.5,
        font: bold,
        color: rgb(0.2, 0.25, 0.3),
      });
      y -= lineHeight;
    }

    if (!pageRows.length) {
      page.drawText("Sin datos para exportar", {
        x: 40,
        y,
        size: 8.5,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      continue;
    }

    for (const row of pageRows) {
      const line = headers.map((h) => String(row[h] ?? "")).join("  |  ").slice(0, 125);
      page.drawText(line, {
        x: 40,
        y,
        size: 7,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= lineHeight;
    }
  }

  return pdf.save();
}
