import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { debitStatusToConsolidadoString } from "@/lib/debit-status";

export type ConsolidadoCardExportItem = {
  id: string;
  requestNumber: string | null;
  tc: string;
  cedula: string;
  nombre: string;
  provincia: string;
  zona: string;
  direccionRaw: string;
  telefonosRaw: string;
  status: string;
  dispatchDate: Date | null;
  deliveryDate?: Date | null;
  updatedAt?: Date | null;
  isRemote: boolean;
  comment?: string | null;
  recipientName?: string | null;
  thirdPartyInfo?: string | null;
  bpdComment?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
};

type WorkbookBookType = "xlsx" | "biff8";

const DATA_HEADERS = [
  "FECH ASIG", "N-SS", "TIPO", "AREA", "SUBAREA", "ANALISTA_ASIGNADO",
  "NRO_ID", "CONTACTO", "NOMBRE_DE_OFICINA", "OFICIAL", "PROVMUNSEC",
  "DESCRIPCION_AMPLIADA", "PROVINCIA", "ESTADO", "DISTRITO_MUNICIPIAL",
  "SECTOR", "CALLE", "NUMERO", "EMPRESA_EDIFICIO", "DEPTO_APTO",
  "REFERENCIA", "TIPO_TEL_1", "TEL_1", "EXT_TEL_1", "TIPO_TEL_2",
  "TEL_2", "EXT_TEL_2", "TIPO_TEL_3", "TEL_3", "EXT_TEL_3",
  "CREADO_POR", "FECHA_CREACION", "ZONA", "STATUS", "COMENTARIO",
  "QUIEN RECIBE", "INFO TERCERO", "FECHA DE ENTREGA", "Comentario BPD",
  "AREAS REMOTAS", "Status Cc", "Contacto Cc", "No. Contact",
];

const DATA_LAST_COLUMN = "AQ";
const DATA_SHEET_NAME = "DATA";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1] ?? null;
}

function replaceXmlAttribute(xml: string, name: string, value: string): string {
  const escaped = escapeXml(value);
  const pattern = new RegExp(`(\\b${name}=")[^"]*(")`);
  if (pattern.test(xml)) return xml.replace(pattern, `$1${escaped}$2`);
  return xml;
}

function normalizeZipTarget(source: string, target: string): string {
  const base = path.posix.dirname(source);
  const normalized = path.posix.normalize(path.posix.join(base, target));
  return normalized.replace(/^\.\//, "");
}

function excelSerialDate(value: Date | null | undefined): number | "" {
  if (!value || Number.isNaN(value.getTime())) return "";
  return Math.round((value.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}

function metadataValue(metadata: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (value !== undefined && value !== null && String(value) !== "") return String(value);
  }
  return "";
}

function cardToDataRow(card: ConsolidadoCardExportItem): Array<string | number> {
  const meta = (card.metadata ?? {}) as Record<string, unknown>;
  const phones = (card.telefonosRaw || "")
    .split("|")
    .map((phone) => phone.replace(/\D/g, "").trim());
  const assignmentDate = excelSerialDate(card.dispatchDate || card.createdAt);
  const status = debitStatusToConsolidadoString(card.status);

  return [
    assignmentDate,
    card.requestNumber || card.tc,
    metadataValue(meta, "TIPO", "tipo") || "Cuentas",
    metadataValue(meta, "AREA", "area") || "Solicitud de Servicios",
    metadataValue(meta, "SUBAREA", "subarea") || "Entrega Tarjeta Debito",
    metadataValue(meta, "ANALISTA_ASIGNADO", "analista") || "U52123",
    card.cedula || metadataValue(meta, "NRO_ID", "cedula"),
    card.nombre || metadataValue(meta, "CONTACTO", "contacto"),
    metadataValue(meta, "NOMBRE_DE_OFICINA", "oficina", "nombreOficina"),
    metadataValue(meta, "OFICIAL", "oficial"),
    metadataValue(meta, "PROVMUNSEC", "provmunsec") || `${card.provincia || ""};${card.zona || ""}`,
    metadataValue(meta, "DESCRIPCION_AMPLIADA", "descripcionAmpliada") || card.direccionRaw || "",
    card.provincia || metadataValue(meta, "PROVINCIA", "provincia"),
    metadataValue(meta, "ESTADO", "estado") || "En proceso",
    metadataValue(meta, "DISTRITO_MUNICIPIAL", "distrito", "municipio") || card.provincia || "",
    metadataValue(meta, "SECTOR", "sector"),
    metadataValue(meta, "CALLE", "calle") || card.direccionRaw || "",
    metadataValue(meta, "NUMERO", "numero") || "0",
    metadataValue(meta, "EMPRESA_EDIFICIO", "empresa"),
    metadataValue(meta, "DEPTO_APTO", "depto"),
    metadataValue(meta, "REFERENCIA", "referencia"),
    metadataValue(meta, "TIPO_TEL_1", "tipoTel1") || "C",
    phones[0] || metadataValue(meta, "TEL_1", "tel1"),
    metadataValue(meta, "EXT_TEL_1", "extTel1") || "0",
    metadataValue(meta, "TIPO_TEL_2", "tipoTel2") || "C",
    phones[1] || metadataValue(meta, "TEL_2", "tel2"),
    metadataValue(meta, "EXT_TEL_2", "extTel2") || "0",
    metadataValue(meta, "TIPO_TEL_3", "tipoTel3") || "0",
    phones[2] || metadataValue(meta, "TEL_3", "tel3"),
    metadataValue(meta, "EXT_TEL_3", "extTel3") || "0",
    metadataValue(meta, "CREADO_POR", "creadoPor") || "APPPOPULAR",
    assignmentDate,
    "En proceso",
    status,
    card.comment || metadataValue(meta, "COMENTARIO", "comentario"),
    card.recipientName || metadataValue(meta, "QUIEN RECIBE", "quienRecibe") || (card.status === "TD_ENTREGADO" ? "PRINCIPAL" : ""),
    card.thirdPartyInfo || metadataValue(meta, "INFO TERCERO", "infoTercero"),
    card.status === "TD_ENTREGADO" ? excelSerialDate(card.deliveryDate || card.updatedAt || new Date()) : "",
    card.bpdComment || metadataValue(meta, "Comentario BPD", "comentarioBpd"),
    card.isRemote ? "SI" : "",
    metadataValue(meta, "Status Cc", "statusCc"),
    metadataValue(meta, "Contacto Cc", "contactoCc"),
    metadataValue(meta, "No. Contact", "noContact") || phones[0] || "",
  ];
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[\s\S]*?<\/si>/g)) {
    const text = [...match[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXml(part[1]))
      .join("");
    strings.push(text);
  }
  return strings;
}

function sharedStringXml(value: string): string {
  const preserve = /^\s|\s$/.test(value);
  const space = preserve ? ' xml:space="preserve"' : "";
  return `<si><t${space}>${escapeXml(value)}</t></si>`;
}

function appendSharedStrings(xml: string, values: string[], oldDataStringRefs: number, newDataStringRefs: number): { xml: string; indexes: Map<string, number> } {
  const strings = parseSharedStrings(xml);
  const indexes = new Map<string, number>();
  strings.forEach((value, index) => indexes.set(value, index));

  const additions: string[] = [];
  for (const value of values) {
    if (!indexes.has(value)) {
      indexes.set(value, strings.length + additions.length);
      additions.push(sharedStringXml(value));
    }
  }

  if (additions.length) {
    xml = xml.replace(/<\/sst>\s*$/, `${additions.join("")}</sst>`);
  }
  const count = Number(xmlAttribute(xml, "count") || 0) - oldDataStringRefs + newDataStringRefs;
  xml = replaceXmlAttribute(xml, "count", String(Math.max(0, count)));
  xml = replaceXmlAttribute(xml, "uniqueCount", String(strings.length + additions.length));
  return { xml, indexes };
}

function columnName(cellReference: string): string {
  return cellReference.replace(/\d+$/, "");
}

function cellElements(rowXml: string): string[] {
  return [...rowXml.matchAll(/<c\b[\s\S]*?(?:<\/c>|\/>)/g)].map((match) => match[0]);
}

function cellStyleMap(rowXml: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const cell of cellElements(rowXml)) {
    const reference = xmlAttribute(cell, "r");
    const style = xmlAttribute(cell, "s");
    if (reference && style) result.set(columnName(reference), style);
  }
  return result;
}

function cellValue(cellXml: string, sharedStrings: string[]): string {
  const value = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (xmlAttribute(cellXml, "t") === "s") return sharedStrings[Number(value)] ?? "";
  return decodeXml(value);
}

function styleForStatus(status: string, statusStyles: Map<string, string>, fallback: string | undefined): string | undefined {
  return statusStyles.get(status) || fallback;
}

function buildCell(reference: string, value: string | number, style: string | undefined, sharedIndexes: Map<string, number>): string {
  const styleAttribute = style ? ` s="${escapeXml(style)}"` : "";
  if (value === "" || value === null || value === undefined) return `<c r="${reference}"${styleAttribute}/>`;
  if (typeof value === "number") return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  const index = sharedIndexes.get(value);
  if (index === undefined) throw new Error(`Missing shared-string index for value ${value}`);
  return `<c r="${reference}"${styleAttribute} t="s"><v>${index}</v></c>`;
}

function rowAttributes(baseRow: string): string {
  const opening = baseRow.match(/^<row\b[^>]*>/)?.[0] || '<row spans="1:43">';
  let attributes = opening.replace(/^<row\b|>$/g, "");
  attributes = attributes.replace(/\s+r="[^"]*"/, "");
  attributes = attributes.replace(/\s+hidden="1"/, "");
  return attributes;
}

function buildDataSheetXml(sheetXml: string, cards: ConsolidadoCardExportItem[], sharedStrings: string[], sharedIndexes: Map<string, number>): { xml: string; oldDataStringRefs: number; newDataStringRefs: number } {
  const sheetDataMatch = sheetXml.match(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/);
  if (!sheetDataMatch) throw new Error("La plantilla no contiene sheetData en DATA");
  const sheetData = sheetDataMatch[0];
  const rows = [...sheetData.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)].map((match) => match[0]);
  const headerRow = rows.find((row) => xmlAttribute(row.match(/^<row\b[^>]*>/)?.[0] || "", "r") === "1") || rows[0];
  const baseRow = rows.find((row) => xmlAttribute(row.match(/^<row\b[^>]*>/)?.[0] || "", "r") === "2") || rows[1] || headerRow;
  if (!headerRow || !baseRow) throw new Error("La plantilla DATA no contiene filas para preservar formato");

  const baseStyles = cellStyleMap(baseRow);
  const headerCells = cellElements(headerRow);
  const headers = new Map<string, string>();
  for (const cell of headerCells) {
    const reference = xmlAttribute(cell, "r");
    if (reference) headers.set(columnName(reference), cellValue(cell, sharedStrings).trim());
  }

  const statusColumn = [...headers.entries()].find(([, value]) => /^STATUS$/i.test(value))?.[0] || "AH";
  const statusStyles = new Map<string, string>();
  let statusFallback: string | undefined;
  let oldDataStringRefs = 0;
  for (const row of rows.slice(1)) {
    for (const cell of cellElements(row)) {
      if (xmlAttribute(cell, "t") === "s") oldDataStringRefs += 1;
    }
    const statusCell = cellElements(row).find((cell) => columnName(xmlAttribute(cell, "r") || "") === statusColumn);
    if (statusCell) {
      const style = xmlAttribute(statusCell, "s");
      if (style) {
        statusFallback ||= style;
        statusStyles.set(cellValue(statusCell, sharedStrings).trim(), style);
      }
    }
  }

  const dataRows: string[] = [];
  let newDataStringRefs = 0;
  for (const [index, card] of cards.entries()) {
    const rowNumber = index + 2;
    const values = cardToDataRow(card);
    const status = String(values[33] || "").trim();
    const cells: string[] = [];
    for (let column = 0; column < DATA_HEADERS.length; column += 1) {
      const reference = `${columnToName(column)}${rowNumber}`;
      let style = baseStyles.get(columnToName(column));
      if (columnToName(column) === statusColumn) style = styleForStatus(status, statusStyles, statusFallback) || style;
      const value = values[column] ?? "";
      if (typeof value === "string" && value !== "") newDataStringRefs += 1;
      cells.push(buildCell(reference, value, style, sharedIndexes));
    }
    dataRows.push(`<row r="${rowNumber}"${rowAttributes(baseRow)}>${cells.join("")}</row>`);
  }

  const opening = sheetData.match(/^<sheetData\b[^>]*>/)?.[0] || "<sheetData>";
  const replacement = `${opening}${headerRow}${dataRows.join("")}</sheetData>`;
  let xml = sheetXml.replace(sheetData, replacement);
  xml = xml.replace(/(<dimension\b[^>]*\bref=")[^"]*(")/, `$1A1:${DATA_LAST_COLUMN}${cards.length + 1}$2`);
  return { xml, oldDataStringRefs, newDataStringRefs };
}

function columnToName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function dataTableTargets(sheetRelationships: string): string[] {
  return [...sheetRelationships.matchAll(/<Relationship\b([^>]*)\/>/g)]
    .filter((match) => xmlAttribute(match[1], "Type")?.endsWith("/table"))
    .map((match) => normalizeZipTarget("xl/worksheets/sheet.xml", xmlAttribute(match[1], "Target") || ""));
}

function updateTableXml(tableXml: string, lastRow: number): string {
  const reference = `A1:${DATA_LAST_COLUMN}${lastRow}`;
  let updated = replaceXmlAttribute(tableXml, "ref", reference);
  const autoFilter = updated.match(/<autoFilter\b[^>]*>/)?.[0];
  if (autoFilter) updated = updated.replace(autoFilter, replaceXmlAttribute(autoFilter, "ref", reference));
  return updated;
}

function markWorkbookForRefresh(xml: string): string {
  const calcPr = xml.match(/<calcPr\b[^>]*\/>/)?.[0];
  if (!calcPr) return xml;
  let replacement = replaceXmlAttribute(calcPr, "calcMode", "auto");
  replacement = replaceXmlAttribute(replacement, "fullCalcOnLoad", "1");
  replacement = replaceXmlAttribute(replacement, "forceFullCalc", "1");
  if (!/\bfullCalcOnLoad=/.test(replacement)) replacement = replacement.replace(/\/>$/, ' fullCalcOnLoad="1"/>');
  if (!/\bforceFullCalc=/.test(replacement)) replacement = replacement.replace(/\/>$/, ' forceFullCalc="1"/>');
  if (!/\bcalcMode=/.test(replacement)) replacement = replacement.replace(/\/>$/, ' calcMode="auto"/>');
  return xml.replace(calcPr, replacement);
}

function markPivotCacheForRefresh(xml: string): string {
  const root = xml.match(/<pivotCacheDefinition\b[^>]*>/)?.[0];
  if (!root) return xml;
  let replacement = root;
  if (/\brefreshOnLoad=/.test(replacement)) replacement = replaceXmlAttribute(replacement, "refreshOnLoad", "1");
  else replacement = replacement.replace(/>$/, ' refreshOnLoad="1">');
  return xml.replace(root, replacement);
}

function sanitizeWorkbookXml(xml: string): string {
  return xml.replace(/(<x15ac:absPath\b[^>]*\burl=")[^"]*(")/, "$1$2");
}

async function readZipText(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) throw new Error(`No se encontró la parte OOXML ${name}`);
  return entry.async("string");
}

export function getConsolidadoTemplatePath(): string {
  return path.join(process.cwd(), "storage", "templates", "consolidado-debito-base.xlsx");
}

export function getConsolidadoOriginalTemplatePath(): string {
  return path.join(process.cwd(), "storage", "templates", "consolidado-debito-base.xls");
}

export async function generateUpdatedConsolidadoExcel(
  cards: ConsolidadoCardExportItem[],
  customTemplateBuffer?: Buffer | null,
  bookType: WorkbookBookType = "xlsx",
): Promise<Buffer> {
  if (bookType !== "xlsx") {
    throw new Error("El consolidado preservado solo se puede exportar en formato XLSX");
  }

  const templateBuffer = customTemplateBuffer ?? fs.readFileSync(getConsolidadoTemplatePath());
  if (templateBuffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    throw new Error("La plantilla XLS BIFF8 no puede conservar objetos desde el runtime; use la plantilla XLSX canónica");
  }

  const zip = await JSZip.loadAsync(templateBuffer);
  let workbookXml = await readZipText(zip, "xl/workbook.xml");
  workbookXml = sanitizeWorkbookXml(markWorkbookForRefresh(workbookXml));
  zip.file("xl/workbook.xml", workbookXml);

  const sheetMatch = workbookXml.match(/<sheet\b[^>]*\bname="DATA"[^>]*\br:id="([^"]+)"[^>]*\/>/i);
  if (!sheetMatch) throw new Error(`La plantilla no contiene la hoja ${DATA_SHEET_NAME}`);
  const workbookRelationships = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const sheetTarget = [...workbookRelationships.matchAll(/<Relationship\b([^>]*)\/>/g)]
    .map((match) => match[1])
    .find((attributes) => xmlAttribute(attributes, "Id") === sheetMatch[1]);
  if (!sheetTarget) throw new Error("No se encontró la relación OOXML de la hoja DATA");
  const sheetPath = normalizeZipTarget("xl/workbook.xml", xmlAttribute(sheetTarget, "Target") || "");
  const sheetXml = await readZipText(zip, sheetPath);
  const sheetRelationshipsPath = path.posix.join(path.posix.dirname(sheetPath), "_rels", `${path.posix.basename(sheetPath)}.rels`);
  const sheetRelationships = await readZipText(zip, sheetRelationshipsPath);
  const sharedStringsXml = zip.file("xl/sharedStrings.xml") ? await readZipText(zip, "xl/sharedStrings.xml") : null;
  const originalSharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];

  const provisionalValues = cards.flatMap((card) => cardToDataRow(card)).filter((value): value is string => typeof value === "string" && value !== "");
  let sharedIndexes = new Map<string, number>();
  if (sharedStringsXml) {
    const appended = appendSharedStrings(sharedStringsXml, provisionalValues, 0, provisionalValues.length);
    sharedIndexes = appended.indexes;
    zip.file("xl/sharedStrings.xml", appended.xml);
  }

  if (!sharedStringsXml) {
    throw new Error("La plantilla canónica no contiene sharedStrings.xml");
  }

  const built = buildDataSheetXml(sheetXml, cards, originalSharedStrings.concat(provisionalValues.filter((value) => !originalSharedStrings.includes(value))), sharedIndexes);
  const correctedSharedStrings = appendSharedStrings(
    sharedStringsXml,
    provisionalValues,
    built.oldDataStringRefs,
    built.newDataStringRefs,
  );
  zip.file("xl/sharedStrings.xml", correctedSharedStrings.xml);
  zip.file(sheetPath, built.xml);

  for (const tablePath of dataTableTargets(sheetRelationships)) {
    const tableXml = await readZipText(zip, tablePath);
    zip.file(tablePath, updateTableXml(tableXml, cards.length + 1));
  }

  for (const entry of Object.values(zip.files)) {
    if (/^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/.test(entry.name)) {
      zip.file(entry.name, markPivotCacheForRefresh(await entry.async("string")));
    }
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
