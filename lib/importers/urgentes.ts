import { parseExcelSerialDate } from "@/lib/date";
import { type ImportError, findHeaderRow, getCell, getSheetRows, mapHeaderIndex, readWorkbook } from "@/lib/importers/workbook";

export type ParsedUrgentRow = {
  tc: string;
  cedula: string;
  nombre: string;
  fechaDespacho: Date | null;
  provincia: string;
  telefono: string;
  status: string;
  direccion: string;
};

const REQUIRED = [
  ["NUMERO TC", "NO. TC", "TC"],
  ["CEDULA", "CEDULA "],
  ["PROVINCIA"],
];

export function parseUrgentesImport(buffer: Buffer) {
  const workbook = readWorkbook(buffer);
  const rows = getSheetRows(workbook);
  const headerRowIndex = findHeaderRow(rows, REQUIRED, 30);
  if (headerRowIndex < 0) {
    throw new Error("No se pudo detectar encabezado de URGENTES");
  }

  const header = rows[headerRowIndex];
  const idx = {
    tc: mapHeaderIndex(header, ["NUMERO TC", "NO. TC", "TC"]),
    nombre: mapHeaderIndex(header, ["NOMBRE", "NOMBRES"]),
    cedula: mapHeaderIndex(header, ["CEDULA", "CEDULA "]),
    fecha: mapHeaderIndex(header, ["FECHA DESP.", "FECHA", "FECHA DESP"]),
    provincia: mapHeaderIndex(header, ["PROVINCIA", "PROVINCIA "]),
    telefono: mapHeaderIndex(header, ["NUMERO", "TELEFONO", "TELEFONO(S)"]),
    status: mapHeaderIndex(header, ["ESTATUS", "STATUS"]),
    direccion: mapHeaderIndex(header, ["DIRECCION DE ENTREGA", "DIRECCION"]),
  };

  const errors: ImportError[] = [];
  const parsed: ParsedUrgentRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const tc = getCell(row, idx.tc);
    const cedula = getCell(row, idx.cedula);
    if (!tc && !cedula) continue;
    if (!tc || !cedula) {
      errors.push({ row: i + 1, message: "Urgente sin TC o cedula" });
      continue;
    }

    parsed.push({
      tc,
      cedula,
      nombre: getCell(row, idx.nombre),
      fechaDespacho: parseExcelSerialDate(getCell(row, idx.fecha)),
      provincia: getCell(row, idx.provincia),
      telefono: getCell(row, idx.telefono),
      status: getCell(row, idx.status),
      direccion: getCell(row, idx.direccion),
    });
  }

  return { rows: parsed, errors, headerRowIndex };
}
