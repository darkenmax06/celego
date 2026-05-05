import { type ImportError, findHeaderRow, getCell, getSheetRows, mapHeaderIndex, readWorkbook } from "@/lib/importers/workbook";
import { parseExcelSerialDate } from "@/lib/date";
import { resolveZone } from "@/lib/zone-map";

export type ParsedCardRow = {
  tc: string;
  cedula: string;
  nombre: string;
  provincia: string;
  zona: string;
  isRemote: boolean;
  tipoEntrega: string;
  fechaDespacho: Date | null;
  emissionType: string;
  deliveryType: string;
  status: string;
  telefonosRaw: string;
  direccionRaw: string;
  externalReference: string;
  supplier: string;
  contractType: string;
};

const REQUIRED = [
  ["TIPO DE ENTREGA", "TIPO ENTREGA"],
  ["FECHA", "FECHA DESP."],
  ["NO. TC", "NUMERO TC", "NO TC", "TC", "TC SANEADA"],
  ["CEDULA", "CEDULA "],
  ["NOMBRES", "NOMBRE", "NOMBRE CLIENTE"],
];

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function pickLikelyTc(row: (string | number | null)[]) {
  for (const cell of row) {
    const raw = String(cell ?? "").trim();
    const digits = onlyDigits(raw);
    if (/^\d{15,19}$/.test(digits)) return digits;
  }
  return "";
}

function pickLikelyCedula(row: (string | number | null)[]) {
  for (const cell of row) {
    const raw = String(cell ?? "").trim();
    const digits = onlyDigits(raw);
    if (/^\d{9,13}$/.test(digits)) return digits;
  }
  return "";
}

function getRangeValues(row: (string | number | null)[], start: number, end: number) {
  if (start < 0 || end < 0 || end < start) return [] as string[];
  const values: string[] = [];
  for (let index = start; index <= end; index += 1) {
    const value = String(row[index] ?? "").trim();
    if (value) values.push(value);
  }
  return values;
}

function parseRemoteFlag(input: string) {
  const value = input.trim().toUpperCase();
  return value === "SI" || value === "S" || value === "TRUE" || value === "1" || value === "X";
}

export function parseCardsImport(buffer: Buffer, preferredSheet = "IMPORTAR_DATA_DIARIA") {
  const workbook = readWorkbook(buffer);
  const rows = getSheetRows(workbook, preferredSheet);

  const headerRowIndex = findHeaderRow(rows, REQUIRED, 40);
  if (headerRowIndex < 0) {
    throw new Error("No se pudo detectar encabezado de IMPORTAR_DATA_DIARIA");
  }

  const header = rows[headerRowIndex];
  const idx = {
    tipoEntrega: mapHeaderIndex(header, ["TIPO DE ENTREGA", "TIPO ENTREGA"]),
    fecha: mapHeaderIndex(header, ["FECHA", "FECHA DESP.", "FECHA DESPACHO", "FECHA DESP"]),
    tc: mapHeaderIndex(header, ["NO. TC", "NUMERO TC", "NO TC", "TC", "TC SANEADA", "TARJETA"]),
    cedula: mapHeaderIndex(header, ["CEDULA", "CEDULA "]),
    nombre: mapHeaderIndex(header, ["NOMBRES", "NOMBRE", "NOMBRE CLIENTE"]),
    direccion: mapHeaderIndex(header, ["DIRECCION", "DIRECCION DE ENTREGA", "CALLE Y NO", "DIRECCION 1"]),
    telefono: mapHeaderIndex(header, ["TELEFONO(S)", "TELEFONO", "NUMERO", "TELEFONO 1", "TEL 1"]),
    provincia: mapHeaderIndex(header, ["PROVINCIA", "ENVIADO A", "ZONA"]),
    zona: mapHeaderIndex(header, ["ZONA"]),
    tipoEmision: mapHeaderIndex(header, ["TIPO DE EMISION", "TIPO EMISION"]),
    ref: mapHeaderIndex(header, ["REFERENCIA", "CODIGO", "CLAVE"]),
    suplidor: mapHeaderIndex(header, ["SUPLIDOR"]),
    contrato: mapHeaderIndex(header, ["CONTRATO"]),
    status: mapHeaderIndex(header, ["STATUS", "ESTATUS", "ESTATUS MBE"]),
    remota: mapHeaderIndex(header, ["ZONA REMOTA", "REMOTA"]),
  };

  const errors: ImportError[] = [];
  const parsed: ParsedCardRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const tc = getCell(row, idx.tc) || pickLikelyTc(row);
    const cedula = getCell(row, idx.cedula) || pickLikelyCedula(row);
    const nombre = getCell(row, idx.nombre);
    if (!tc && !cedula && !nombre) continue;

    if (!tc || !cedula) {
      errors.push({ row: i + 1, message: "Fila sin TC o cedula" });
      continue;
    }

    const provincia = getCell(row, idx.provincia) || getCell(row, idx.zona);
    const zonaRaw = getCell(row, idx.zona);
    const zonaUpper = zonaRaw.toUpperCase().trim();
    const zona =
      zonaUpper === "METRO" || zonaUpper === "ESTE" || zonaUpper === "NORTE" || zonaUpper === "SUR"
        ? zonaRaw
        : resolveZone(provincia || zonaRaw, "Metro");

    const addressStart = idx.direccion >= 0 ? idx.direccion : 9; // J
    const addressEnd = idx.telefono > addressStart ? idx.telefono - 1 : 19; // T
    const phoneStart = idx.telefono >= 0 ? idx.telefono : 20; // U
    const phoneEnd = idx.suplidor > phoneStart ? idx.suplidor - 1 : 27; // AB
    const direccionRaw = getRangeValues(row, addressStart, addressEnd).join(" | ");
    const telefonosRaw = getRangeValues(row, phoneStart, phoneEnd)
      .map((cell) => cell.replace(/\D/g, ""))
      .filter((cell) => cell.length >= 7)
      .join(" | ");
    const isRemote = parseRemoteFlag(getCell(row, idx.remota));

    parsed.push({
      tc,
      cedula,
      nombre: nombre || "SIN NOMBRE",
      provincia: provincia || "Santo Domingo",
      zona,
      isRemote,
      tipoEntrega: getCell(row, idx.tipoEntrega),
      fechaDespacho: parseExcelSerialDate(getCell(row, idx.fecha)),
      emissionType: getCell(row, idx.tipoEmision),
      deliveryType: getCell(row, idx.tipoEntrega),
      status: (getCell(row, idx.status) || "DESPACHADA").toUpperCase(),
      telefonosRaw,
      direccionRaw,
      externalReference: getCell(row, idx.ref),
      supplier: getCell(row, idx.suplidor),
      contractType: getCell(row, idx.contrato),
    });
  }

  return { rows: parsed, errors, headerRowIndex };
}
