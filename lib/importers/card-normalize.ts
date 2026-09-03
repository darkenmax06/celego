import { buildSourceRecordKey, type DispatchOrigin } from "../dispatch-origin";

export type NormalizedCardImportRow = {
  origin: DispatchOrigin;
  tc: string;
  cedula: string;
  nombre: string;
  direccionRaw: string;
  telefonosRaw: string | null;
  provincia: string | null;
  zona: string | null;
  isRemote: boolean | null;
  dispatchDate: Date;
  quantity: number;
  sourceTerminal: string | null;
  deliveryType: string | null;
  emissionType: string | null;
  supplier: string | null;
  contractType: string | null;
  externalReference: string | null;
  status: "DESPACHADA";
  sourceRowNumber: number;
  sourceRecordKey: string;
};

export type NormalizedImportError = { row: number; message: string; code: string };
type Cell = string | number | Date | null | undefined;
type Rows = Cell[][];

const centroRequired = ["TC", "TERMINAL", "NOMBRE DEL CLIENTE", "CEDULA", "SECTOR", "CANTIDAD", "FECHA DE CARGA"];
const torreRequiredGroups = [["TIPO DE ENTREGA", "TIPO ENTREGA"], ["FECHA", "FECHA DESP.", "FECHA DESPACHO"], ["NO. TC", "NUMERO TC", "NO TC", "TC", "TC SANEADA"], ["CEDULA"], ["NOMBRES", "NOMBRE", "NOMBRE CLIENTE"]];
const centroAcopioLocation = { provincia: "Santo Domingo", zona: "Metro" } as const;

function header(value: Cell) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}
function text(value: Cell) {
  return String(value ?? "").trim();
}
function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
function presentIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((item) => aliases.includes(item));
}
function validIdentifier(value: string, min: number, max: number) {
  const normalized = onlyDigits(value);
  return new RegExp(`^\\d{${min},${max}}$`).test(normalized) && !/^0+$/.test(normalized) ? normalized : null;
}
/**
 * Day-first date, matching how the source files are written locally.
 *
 * `new Date("09/07/2026")` reads that as September 7th, so every slash-dated
 * row landed with day and month transposed. Separated formats are parsed
 * explicitly and only ISO (year-first) strings fall through to `Date`.
 */
export function parseDate(value: Cell): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 25569) return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  const raw = text(value);
  if (!raw) return null;

  const dayFirst = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = dayFirst[3].length === 2 ? 2000 + Number(dayFirst[3]) : Number(dayFirst[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    // rejects impossible days such as 31/02, which JS would roll into March
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  const isoLike = raw.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]);
    const day = Number(isoLike[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
function phoneList(values: Cell[]) {
  const phones = values.map((value) => onlyDigits(text(value))).filter((value) => /^\d{7,15}$/.test(value) && !/^0+$/.test(value) && value !== "0000000001");
  return phones.length ? [...new Set(phones)].join(" | ") : null;
}
function findHeader(rows: Rows, predicate: (headers: string[]) => boolean) {
  return rows.findIndex((row) => predicate(row.map(header)));
}
function indexMap(headers: string[], aliases: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, presentIndex(headers, values)])) as Record<string, number>;
}
function cell(row: Cell[], index: number) { return index >= 0 ? text(row[index]) : ""; }
function hasDetailShape(row: Cell[]) { return row.some((value) => text(value)); }

export function detectCardImportFormat(rows: Rows): { origin: DispatchOrigin; headerRowIndex: number } {
  const centroIndex = findHeader(rows, (headers) => centroRequired.every((required) => headers.includes(required)));
  const torreIndex = findHeader(rows, (headers) => torreRequiredGroups.every((group) => group.some((item) => headers.includes(item))));
  if ((centroIndex >= 0 && torreIndex >= 0) || (centroIndex < 0 && torreIndex < 0)) throw new Error("Formato de importacion desconocido o ambiguo");
  return centroIndex >= 0 ? { origin: "CENTRO_ACOPIO", headerRowIndex: centroIndex } : { origin: "TORRE_POPULAR", headerRowIndex: torreIndex };
}

export function parseNormalizedCardRows(rows: Rows) {
  const detected = detectCardImportFormat(rows);
  const headers = rows[detected.headerRowIndex].map(header);
  const errors: NormalizedImportError[] = [];
  const output: NormalizedCardImportRow[] = [];
  const sourceKeys = new Set<string>();
  const aliases = detected.origin === "CENTRO_ACOPIO"
    ? { tc: ["TC"], terminal: ["TERMINAL"], nombre: ["NOMBRE DEL CLIENTE"], cedula: ["CEDULA"], direccion: ["SECTOR"], telefono: ["NUMEROS DE CONTACTO"], additionalPhone: ["NUMEROS ADC"], quantity: ["CANTIDAD"], date: ["FECHA DE CARGA"], provincia: [], zona: [], remote: [], delivery: [], emission: [], supplier: [], contract: [], reference: [], tcc: ["TCC"] }
    : { tc: ["NO. TC", "NUMERO TC", "NO TC", "TC", "TC SANEADA"], terminal: [], nombre: ["NOMBRES", "NOMBRE", "NOMBRE CLIENTE"], cedula: ["CEDULA"], direccion: ["DIRECCION", "DIRECCION DE ENTREGA", "CALLE Y NO", "DIRECCION 1"], telefono: ["TELEFONO(S)", "TELEFONO", "NUMERO", "TELEFONO 1", "TEL 1"], additionalPhone: [], quantity: [], date: ["FECHA", "FECHA DESP.", "FECHA DESPACHO"], provincia: ["PROVINCIA", "ENVIADO A"], zona: ["ZONA"], remote: ["ZONA REMOTA", "REMOTA"], delivery: ["TIPO DE ENTREGA", "TIPO ENTREGA"], emission: ["TIPO DE EMISION", "TIPO EMISION"], supplier: ["SUPLIDOR"], contract: ["CONTRATO"], reference: ["REFERENCIA", "CODIGO", "CLAVE"], tcc: [] };
  const indexes = indexMap(headers, aliases);
  for (let offset = detected.headerRowIndex + 1; offset < rows.length; offset += 1) {
    const row = rows[offset];
    if (!hasDetailShape(row)) continue;
    const rawTc = cell(row, indexes.tc);
    const rawCedula = cell(row, indexes.cedula);
    const name = cell(row, indexes.nombre);
    const quantityRaw = cell(row, indexes.quantity);
    if (!rawTc && !rawCedula && !name) continue;
    if (/subtotal|total/i.test(name) || (detected.origin === "CENTRO_ACOPIO" && !rawTc && quantityRaw)) continue;
    const tc = validIdentifier(rawTc, 15, 19);
    const cedula = validIdentifier(rawCedula, 9, 13);
    const dispatchDate = parseDate(indexes.date >= 0 ? row[indexes.date] : null);
    const direccionRaw = cell(row, indexes.direccion);
    const quantity = detected.origin === "CENTRO_ACOPIO" ? Number(quantityRaw) : 1;
    const failures = [!tc && "TC invalido", !cedula && "cedula invalida", !name && "nombre requerido", !direccionRaw && "direccion requerida", !dispatchDate && "fecha requerida", !(Number.isInteger(quantity) && quantity > 0) && "cantidad invalida"].filter(Boolean) as string[];
    if (failures.length) { errors.push({ row: offset + 1, code: "INVALID_ROW", message: failures.join(", ") }); continue; }
    const sourceTerminal = indexes.terminal >= 0 ? cell(row, indexes.terminal) || null : null;
    const sourceRecordKey = buildSourceRecordKey({ origin: detected.origin, tc: tc!, cedula: cedula!, dispatchDate: dispatchDate! });
    if (sourceKeys.has(sourceRecordKey)) {
      errors.push({ row: offset + 1, code: "DUPLICATE_SOURCE_RECORD", message: "Fila duplicada para la misma procedencia, TC, cedula y fecha" });
      continue;
    }
    sourceKeys.add(sourceRecordKey);
    const location = detected.origin === "CENTRO_ACOPIO"
      ? centroAcopioLocation
      : { provincia: cell(row, indexes.provincia) || null, zona: cell(row, indexes.zona) || null };
    output.push({ origin: detected.origin, tc: tc!, cedula: cedula!, nombre: name, direccionRaw, telefonosRaw: phoneList([indexes.telefono >= 0 ? row[indexes.telefono] : null, indexes.additionalPhone >= 0 ? row[indexes.additionalPhone] : null]), ...location, isRemote: indexes.remote >= 0 ? /^(SI|S|TRUE|1|X)$/i.test(cell(row, indexes.remote)) : null, dispatchDate: dispatchDate!, quantity, sourceTerminal, deliveryType: cell(row, indexes.delivery) || null, emissionType: cell(row, indexes.emission) || null, supplier: cell(row, indexes.supplier) || null, contractType: cell(row, indexes.contract) || null, externalReference: cell(row, indexes.reference) || null, status: "DESPACHADA", sourceRowNumber: offset + 1, sourceRecordKey });
  }
  return { ...detected, rows: output, errors };
}
