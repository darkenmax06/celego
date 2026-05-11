import ExcelJS from "exceljs";
import Papa from "papaparse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText(title, {
    x: 40,
    y: 760,
    size: 16,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  let y = 730;
  const lineHeight = 14;

  page.drawText(headers.join(" | "), {
    x: 40,
    y,
    size: 9,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= lineHeight;

  for (const row of rows.slice(0, 45)) {
    const line = headers.map((h) => String(row[h] ?? "")).join(" | ").slice(0, 120);
    page.drawText(line, {
      x: 40,
      y,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= lineHeight;
    if (y < 40) break;
  }

  return pdf.save();
}
