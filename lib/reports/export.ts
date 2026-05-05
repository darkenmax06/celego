import ExcelJS from "exceljs";
import Papa from "papaparse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function exportRowsToXlsx(
  rows: Record<string, unknown>[],
  sheetName = "Reporte",
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  sheet.addRow(headers);

  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h] ?? ""));
  }

  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => {
    col.width = Math.max(12, (col.header ? String(col.header).length : 10) + 2);
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
