import { parseExcelSerialDate } from "@/lib/date";
import { type ImportError, findHeaderRow, getCell, getSheetRows, mapHeaderIndex, readWorkbook } from "@/lib/importers/workbook";

export type ParsedLotTrackingRow = {
  lotNumber: string;
  enviadoA: string;
  fechaEnvio: Date | null;
  fechaRetorno: Date | null;
  estatus: string;
};

const REQUIRED = [
  ["NO. DE LOTE", "LOTE", "NO LOTE"],
  ["ENVIADO A"],
  ["FECHA DE ENVIO", "FECHA ENVIO"],
];

export function parseLotesImport(buffer: Buffer) {
  const workbook = readWorkbook(buffer);
  const sheetName =
    workbook.SheetNames.find((name) => name.toUpperCase().includes("SEGUIMIENTO")) ??
    workbook.SheetNames[0];

  const rows = getSheetRows(workbook, sheetName);
  const headerRowIndex = findHeaderRow(rows, REQUIRED, 40);
  if (headerRowIndex < 0) {
    throw new Error("No se detecto encabezado de seguimiento de lotes");
  }

  const header = rows[headerRowIndex];
  const idx = {
    lot: mapHeaderIndex(header, ["NO. DE LOTE", "LOTE", "NO LOTE"]),
    enviadoA: mapHeaderIndex(header, ["ENVIADO A"]),
    fechaEnvio: mapHeaderIndex(header, ["FECHA DE ENVIO", "FECHA ENVIO"]),
    fechaRetorno: mapHeaderIndex(header, ["FECHA DE RETORNO", "FECHA RETORNO"]),
    estatus: mapHeaderIndex(header, ["ESTATUS", "STATUS"]),
  };

  const errors: ImportError[] = [];
  const parsed: ParsedLotTrackingRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const lotNumber = getCell(row, idx.lot);
    if (!lotNumber) continue;

    parsed.push({
      lotNumber,
      enviadoA: getCell(row, idx.enviadoA),
      fechaEnvio: parseExcelSerialDate(getCell(row, idx.fechaEnvio)),
      fechaRetorno: parseExcelSerialDate(getCell(row, idx.fechaRetorno)),
      estatus: getCell(row, idx.estatus) || "PENDIENTE",
    });
  }

  return { rows: parsed, errors, headerRowIndex };
}
