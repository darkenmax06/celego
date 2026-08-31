import { parseExcelSerialDate } from "@/lib/date";
import { type ImportError, findHeaderRow, getCell, getSheetRows, mapHeaderIndex, readWorkbook } from "@/lib/importers/workbook";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 2, task 2.1.
 *
 * Mirrors `lib/importers/urgentes.ts` exactly (design "Import/export/UI
 * reuse existing templates verbatim"), reading the "MBE" sheet instead of
 * the first sheet.
 */
export type ParsedSolicitudRow = {
  tc: string;
  cedula: string;
  nombre: string;
  ticket: string;
  etapa: string;
  analista: string;
  destino: string;
  provinciaSolicitud: string;
  telefono: string;
  direccion: string;
  logActual: string;
  cantidadDias: string;
  fechaASuplidor: Date | null;
  sourceRow: Record<string, string>;
};

const REQUIRED = [
  ["NUMERO TC", "NO. TC", "TC"],
  ["CEDULA", "CEDULA "],
  ["TICKET"],
];

export function parseSolicitudesImport(buffer: Buffer) {
  const workbook = readWorkbook(buffer);
  const rows = getSheetRows(workbook, "MBE");
  const headerRowIndex = findHeaderRow(rows, REQUIRED, 30);
  if (headerRowIndex < 0) {
    throw new Error("No se pudo detectar encabezado de SOLICITUDES");
  }

  const header = rows[headerRowIndex];
  const idx = {
    tc: mapHeaderIndex(header, ["NUMERO TC", "NO. TC", "TC"]),
    cedula: mapHeaderIndex(header, ["CEDULA", "CEDULA "]),
    nombre: mapHeaderIndex(header, ["NOMBRE", "NOMBRES"]),
    ticket: mapHeaderIndex(header, ["TICKET"]),
    etapa: mapHeaderIndex(header, ["ETAPA"]),
    analista: mapHeaderIndex(header, ["ANALISTA"]),
    destino: mapHeaderIndex(header, ["DESTINO"]),
    provincia: mapHeaderIndex(header, ["PROVINCIA", "PROVINCIA "]),
    telefono: mapHeaderIndex(header, ["NUMERO", "TELEFONO", "TELEFONO(S)"]),
    direccion: mapHeaderIndex(header, ["DIRECCION DE ENTREGA", "DIRECCION"]),
    logActual: mapHeaderIndex(header, ["LOG ACTUAL", "LOG"]),
    cantidadDias: mapHeaderIndex(header, ["CANTIDAD DIAS", "CANTIDAD DE DIAS"]),
    fechaASuplidor: mapHeaderIndex(header, ["FECHA A SUPLIDOR", "FECHA SUPLIDOR"]),
  };

  const errors: ImportError[] = [];
  const parsed: ParsedSolicitudRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const tc = getCell(row, idx.tc);
    const cedula = getCell(row, idx.cedula);
    if (!tc && !cedula) continue;
    if (!tc || !cedula) {
      errors.push({ row: i + 1, message: "Solicitud sin TC o cedula" });
      continue;
    }

    const sourceRow: Record<string, string> = {};
    header.forEach((headerCell, cellIndex) => {
      const key = String(headerCell ?? "").trim();
      if (key) sourceRow[key] = getCell(row, cellIndex);
    });

    parsed.push({
      tc,
      cedula,
      nombre: getCell(row, idx.nombre),
      ticket: getCell(row, idx.ticket),
      etapa: getCell(row, idx.etapa),
      analista: getCell(row, idx.analista),
      destino: getCell(row, idx.destino),
      provinciaSolicitud: getCell(row, idx.provincia),
      telefono: getCell(row, idx.telefono),
      direccion: getCell(row, idx.direccion),
      logActual: getCell(row, idx.logActual),
      cantidadDias: getCell(row, idx.cantidadDias),
      fechaASuplidor: parseExcelSerialDate(getCell(row, idx.fechaASuplidor)),
      sourceRow,
    });
  }

  return { rows: parsed, errors, headerRowIndex };
}
