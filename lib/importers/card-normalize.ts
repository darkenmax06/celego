import { CUSTOMER_ID_RULE, normalizeCustomerId } from "../customer-id";
import { buildSourceRecordKey, type DispatchOrigin } from "../dispatch-origin";

export type NormalizedCardImportRow = {
  origin: DispatchOrigin;
  tc: string;
  cedula: string;
  nombre: string;
  direccionRaw: string | null;
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
const PLACEHOLDER_PHONE = /^(\d)\1+$/;
const PLACEHOLDER_ADDRESS = /^(N\/?A|NINGUNO|NINGUNA|NO APLICA|S\/N|[.\-_*\s]*|0+1?)$/i;

function phoneCandidates(value: Cell) {
  const found: string[] = [];
  for (const chunk of text(value).split(/[/,;|\r\n]+/)) {
    if (!chunk.trim()) continue;
    const digits = onlyDigits(chunk);
    // "8496204860 8AMA 5PM" or two numbers in one cell: judge each token on its own.
    if (/[a-z]/i.test(chunk) || digits.length > 15) {
      for (const token of chunk.split(/\s+/)) {
        if (/[a-z]/i.test(token)) continue;
        const tokenDigits = onlyDigits(token);
        if (tokenDigits.length >= 7 && tokenDigits.length <= 15) found.push(tokenDigits);
      }
    } else if (digits.length >= 7) {
      found.push(digits);
    }
  }
  return found;
}
/** Every phone cell contributes; placeholders such as 9999999999 or 0000000001 are dropped. */
function phoneList(values: Cell[]) {
  const phones = values
    .flatMap(phoneCandidates)
    .filter((value) => !PLACEHOLDER_PHONE.test(value) && value !== "0000000001");
  return phones.length ? [...new Set(phones)].join(" | ") : null;
}
/** Joins every address/reference cell in sheet order without repeating the same text. */
function addressText(values: Cell[]) {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const value of values) {
    const part = text(value).replace(/\s+/g, " ");
    if (!part || PLACEHOLDER_ADDRESS.test(part)) continue;
    const key = part.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  return parts.length ? parts.join(" | ") : null;
}
/** Sheet columns whose header matches, first occurrence of each header only. */
function columnsMatching(headers: string[], pattern: RegExp) {
  const seen = new Set<string>();
  const columns: number[] = [];
  headers.forEach((name, index) => {
    if (!pattern.test(name) || seen.has(name)) return;
    seen.add(name);
    columns.push(index);
  });
  return columns;
}
function shown(value: string) {
  return value ? `"${value.length > 40 ? `${value.slice(0, 40)}...` : value}"` : "vacio";
}
function findHeader(rows: Rows, predicate: (headers: string[]) => boolean) {
  return rows.findIndex((row) => predicate(row.map(header)));
}
function indexMap(headers: string[], aliases: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, presentIndex(headers, values)])) as Record<string, number>;
}
function cell(row: Cell[], index: number) { return index >= 0 ? text(row[index]) : ""; }
function hasDetailShape(row: Cell[]) { return row.some((value) => text(value)); }
function isDecorativeCentroFooter(
  rawTc: string,
  rawCedula: string,
  name: string,
  quantityRaw: string,
  dispatchDate: Date | null,
) {
  return (
    !rawTc &&
    !rawCedula &&
    !quantityRaw &&
    !dispatchDate &&
    /^[.X*\s_-]+$/i.test(name)
  );
}

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
  const ignored: Array<{ row: number; message: string }> = [];
  const sourceKeys = new Map<string, number>();
  const aliases = detected.origin === "CENTRO_ACOPIO"
    ? { tc: ["TC"], terminal: ["TERMINAL"], nombre: ["NOMBRE DEL CLIENTE"], cedula: ["CEDULA"], quantity: ["CANTIDAD"], date: ["FECHA DE CARGA"], provincia: [], zona: [], remote: [], delivery: [], emission: [], supplier: [], contract: [], reference: [], tcc: ["TCC"] }
    : { tc: ["NO. TC", "NUMERO TC", "NO TC", "TC", "TC SANEADA"], terminal: [], nombre: ["NOMBRES", "NOMBRE", "NOMBRE CLIENTE"], cedula: ["CEDULA"], quantity: [], date: ["FECHA", "FECHA DESP.", "FECHA DESPACHO"], provincia: ["PROVINCIA", "ENVIADO A"], zona: ["ZONA"], remote: ["ZONA REMOTA", "REMOTA"], delivery: ["TIPO DE ENTREGA", "TIPO ENTREGA"], emission: ["TIPO DE EMISION", "TIPO EMISION"], supplier: ["SUPLIDOR"], contract: ["CONTRATO"], reference: ["REFERENCIA", "CODIGO", "CLAVE"], tcc: [] };
  const indexes = indexMap(headers, aliases);
  const centro = detected.origin === "CENTRO_ACOPIO";
  const addressColumns = columnsMatching(headers, centro ? /^SECTOR$/ : /^(CALLE Y NO|DIRECCION|DIRECCION DE ENTREGA|DIRECCION \d+|REFERENCIA \d+)$/);
  const phoneColumns = columnsMatching(headers, centro ? /^(NUMEROS DE CONTACTO|NUMEROS ADC)$/ : /^(TELEFONO\(S\)|TELEFONO|NUMERO|TELEFONO \d+|TEL \d+)$/);
  for (let offset = detected.headerRowIndex + 1; offset < rows.length; offset += 1) {
    const row = rows[offset];
    if (!hasDetailShape(row)) continue;
    const rawTc = cell(row, indexes.tc);
    const rawCedula = cell(row, indexes.cedula);
    const name = cell(row, indexes.nombre);
    const quantityRaw = cell(row, indexes.quantity);
    const rawDate = indexes.date >= 0 ? row[indexes.date] : null;
    const dispatchDate = parseDate(rawDate);
    if (!rawTc && !rawCedula && !name) continue;
    if (/subtotal|total/i.test(name) || (centro && !rawTc && quantityRaw)) {
      ignored.push({ row: offset + 1, message: `Fila de totales ignorada (${shown(name)}): no es una tarjeta` });
      continue;
    }
    if (centro && isDecorativeCentroFooter(rawTc, rawCedula, name, quantityRaw, dispatchDate)) {
      ignored.push({ row: offset + 1, message: `Fila decorativa ignorada (${shown(name)}): no identifica una tarjeta` });
      continue;
    }
    const tc = validIdentifier(rawTc, 15, 19);
    const cedula = normalizeCustomerId(rawCedula);
    const quantity = centro ? Number(quantityRaw) : 1;
    const failures = [
      !tc && `TC invalido: ${shown(rawTc)} (debe tener entre 15 y 19 digitos y no ser solo ceros)`,
      !cedula && `cedula invalida: ${shown(rawCedula)} (debe ser ${CUSTOMER_ID_RULE})`,
      !name && "nombre vacio (el cliente es obligatorio)",
      !dispatchDate && `fecha invalida: ${shown(text(rawDate))} (use dd/mm/aaaa o aaaa-mm-dd)`,
      !(Number.isInteger(quantity) && quantity > 0) && `cantidad invalida: ${shown(quantityRaw)} (debe ser un entero mayor que 0)`,
    ].filter(Boolean) as string[];
    if (failures.length) {
      const who = name ? ` [cliente ${shown(name)}]` : "";
      errors.push({ row: offset + 1, code: "INVALID_ROW", message: `${failures.join("; ")}${who}` });
      continue;
    }
    const sourceTerminal = indexes.terminal >= 0 ? cell(row, indexes.terminal) || null : null;
    const sourceRecordKey = buildSourceRecordKey({ origin: detected.origin, tc: tc!, cedula: cedula!, dispatchDate: dispatchDate! });
    const firstRow = sourceKeys.get(sourceRecordKey);
    if (firstRow !== undefined) {
      errors.push({ row: offset + 1, code: "DUPLICATE_SOURCE_RECORD", message: `Fila duplicada: la TC ${tc}, la cedula ${cedula} y la fecha ya aparecen en la fila ${firstRow}; se conserva la primera` });
      continue;
    }
    sourceKeys.set(sourceRecordKey, offset + 1);
    const location = centro
      ? centroAcopioLocation
      : { provincia: cell(row, indexes.provincia) || null, zona: cell(row, indexes.zona) || null };
    output.push({ origin: detected.origin, tc: tc!, cedula: cedula!, nombre: name, direccionRaw: addressText(addressColumns.map((index) => row[index])), telefonosRaw: phoneList(phoneColumns.map((index) => row[index])), ...location, isRemote: indexes.remote >= 0 ? /^(SI|S|TRUE|1|X)$/i.test(cell(row, indexes.remote)) : null, dispatchDate: dispatchDate!, quantity, sourceTerminal, deliveryType: cell(row, indexes.delivery) || null, emissionType: cell(row, indexes.emission) || null, supplier: cell(row, indexes.supplier) || null, contractType: cell(row, indexes.contract) || null, externalReference: cell(row, indexes.reference) || null, status: "DESPACHADA", sourceRowNumber: offset + 1, sourceRecordKey });
  }
  return { ...detected, rows: output, errors, ignored };
}
