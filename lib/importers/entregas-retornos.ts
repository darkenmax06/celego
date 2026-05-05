import { parseExcelSerialDate } from "@/lib/date";
import { type ImportError, findHeaderRow, getCell, getSheetRows, mapHeaderIndex, readWorkbook } from "@/lib/importers/workbook";

export type ParsedStatusRow = {
  tc: string;
  cedula: string;
  nombre: string;
  fecha: Date | null;
  comentario: string;
  status: "ENTREGADA" | "RETORNADA";
};

const REQUIRED = [
  ["NO", "NO."],
  ["NUMERO TC", "NO. TC", "TC"],
  ["CEDULA"],
];

function parseSheetRows(
  rows: (string | number | null)[][],
  status: "ENTREGADA" | "RETORNADA",
  errors: ImportError[],
) {
  const headerRowIndex = findHeaderRow(rows, REQUIRED, 30);
  if (headerRowIndex < 0) {
    return [] as ParsedStatusRow[];
  }

  const header = rows[headerRowIndex];
  const idx = {
    tc: mapHeaderIndex(header, ["NUMERO TC", "NO. TC", "TC"]),
    cedula: mapHeaderIndex(header, ["CEDULA", "CEDULA "]),
    nombre: mapHeaderIndex(header, ["NOMBRE", "NOMBRES", "NOMBRE CLIENTE"]),
    fecha: mapHeaderIndex(header, ["FECHA"]),
    comentario: mapHeaderIndex(header, ["COMENTARIO", "MOTIVO"]),
  };

  const parsed: ParsedStatusRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const tc = getCell(row, idx.tc);
    const cedula = getCell(row, idx.cedula);
    if (!tc && !cedula) continue;
    if (!tc || !cedula) {
      errors.push({ row: i + 1, message: `${status} sin TC o cedula` });
      continue;
    }

    parsed.push({
      tc,
      cedula,
      nombre: getCell(row, idx.nombre),
      fecha: parseExcelSerialDate(getCell(row, idx.fecha)),
      comentario: getCell(row, idx.comentario),
      status,
    });
  }

  return parsed;
}

export function parseEntregasRetornosImport(buffer: Buffer) {
  const workbook = readWorkbook(buffer);
  const errors: ImportError[] = [];

  const retornadasRows = workbook.Sheets.RETORNADAS
    ? getSheetRows(workbook, "RETORNADAS")
    : [];
  const entregadasRows = workbook.Sheets.ENTREGADAS
    ? getSheetRows(workbook, "ENTREGADAS")
    : [];

  const retornadas = parseSheetRows(retornadasRows, "RETORNADA", errors);
  const entregadas = parseSheetRows(entregadasRows, "ENTREGADA", errors);

  return {
    rows: [...retornadas, ...entregadas],
    errors,
  };
}
