import * as XLSX from "xlsx";
import { normalizeText } from "@/lib/utils";

export type ImportError = {
  row: number;
  message: string;
};

export function readWorkbook(buffer: Buffer) {
  return XLSX.read(buffer, { type: "buffer", cellDates: false });
}

export function getSheetRows(workbook: XLSX.WorkBook, sheetName?: string) {
  const target =
    sheetName && workbook.Sheets[sheetName]
      ? workbook.Sheets[sheetName]
      : workbook.Sheets[workbook.SheetNames[0]];

  if (!target) {
    throw new Error("No se encontro una hoja valida en el archivo");
  }

  return XLSX.utils.sheet_to_json<(string | number | null)[]>(target, {
    header: 1,
    raw: false,
    defval: "",
  });
}

export function findHeaderRow(
  rows: (string | number | null)[][],
  requiredAliases: string[][],
  maxRowsToScan = 30,
) {
  const limit = Math.min(rows.length, maxRowsToScan);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const normalized = rows[rowIndex].map((cell) => normalizeText(String(cell ?? "")));

    let matched = 0;
    for (const aliases of requiredAliases) {
      const hasAny = aliases.some((alias) => normalized.includes(normalizeText(alias)));
      if (hasAny) matched += 1;
    }

    if (matched >= Math.max(2, requiredAliases.length - 1)) {
      return rowIndex;
    }
  }

  return -1;
}

export function mapHeaderIndex(headerRow: (string | number | null)[], aliases: string[]) {
  const normalizedAliases = aliases.map((x) => normalizeText(x));
  for (let i = 0; i < headerRow.length; i += 1) {
    const key = normalizeText(String(headerRow[i] ?? ""));
    if (normalizedAliases.includes(key)) {
      return i;
    }
  }
  return -1;
}

export function getCell(row: (string | number | null)[], index: number) {
  if (index < 0) return "";
  const value = row[index];
  return String(value ?? "").trim();
}
