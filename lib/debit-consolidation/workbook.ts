import JSZip from "jszip";
import { CANCELLED_DATA_STATUS } from "./constants";
import type {
  DebitConsolidatedRow,
  DebitReconciliationPlan,
  WorkbookCellValue,
} from "./types";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(oneBasedIndex: number) {
  let value = oneBasedIndex;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function excelSerial(value: Date) {
  const utc = Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return (utc - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function cellXml(reference: string, value: WorkbookCellValue, style?: string) {
  const styleAttribute = style ? ` s="${escapeXml(style)}"` : "";
  if (value == null || value === "") return `<c r="${reference}"${styleAttribute}/>`;
  if (value instanceof Date) {
    return `<c r="${reference}"${styleAttribute}><v>${excelSerial(value)}</v></c>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  }
  const text = escapeXml(String(value));
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function relationshipTarget(rels: string, id: string) {
  const tags = rels.match(/<Relationship\b[^>]*\/>/g) ?? [];
  for (const tag of tags) {
    const relId = tag.match(/\bId="([^"]+)"/)?.[1];
    if (relId !== id) continue;
    return tag.match(/\bTarget="([^"]+)"/)?.[1] ?? null;
  }
  return null;
}

function sheetRelationshipId(workbook: string, sheetName: string) {
  const tags = workbook.match(/<sheet\b[^>]*\/>/g) ?? [];
  for (const tag of tags) {
    if (tag.match(/\bname="([^"]+)"/)?.[1] !== sheetName) continue;
    return tag.match(/\br:id="([^"]+)"/)?.[1] ?? null;
  }
  return null;
}

function normalizeZipPath(base: string, target: string) {
  const parts = `${base}/${target}`.replaceAll("\\", "/").split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") result.pop();
    else result.push(part);
  }
  return result.join("/");
}

function rowPattern(rowNumber: number) {
  return new RegExp(
    `<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*(?:\\/>|>[\\s\\S]*?<\\/row>)`,
  );
}

function readRow(sheetXml: string, rowNumber: number) {
  return sheetXml.match(rowPattern(rowNumber))?.[0] ?? null;
}

function stylesFromRow(rowXml: string | null) {
  const styles = new Map<string, string>();
  for (const cell of rowXml?.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
    const reference = cell.match(/\br="([A-Z]+)\d+"/)?.[1];
    const style = cell.match(/\bs="([^"]+)"/)?.[1];
    if (reference && style) styles.set(reference, style);
  }
  return styles;
}

function replaceOrAppendRow(sheetXml: string, rowNumber: number, rowXml: string) {
  const pattern = rowPattern(rowNumber);
  if (pattern.test(sheetXml)) return sheetXml.replace(pattern, rowXml);
  return sheetXml.replace("</sheetData>", `${rowXml}</sheetData>`);
}

function replaceCellInRow(
  rowXml: string,
  rowNumber: number,
  column: string,
  value: WorkbookCellValue,
) {
  const reference = `${column}${rowNumber}`;
  const cellPattern = new RegExp(
    `<c\\b(?=[^>]*\\br="${reference}")[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`,
  );
  const existing = rowXml.match(cellPattern)?.[0];
  const style = existing?.match(/\bs="([^"]+)"/)?.[1];
  const replacement = cellXml(reference, value, style);
  if (existing) return rowXml.replace(cellPattern, replacement);
  return rowXml.replace("</row>", `${replacement}</row>`);
}

function rowXml(row: DebitConsolidatedRow, styles: Map<string, string>) {
  const cells = row.cells
    .map((value, index) => {
      const column = columnName(index + 1);
      return cellXml(`${column}${row.workbookRow}`, value, styles.get(column));
    })
    .join("");
  return `<row r="${row.workbookRow}" spans="1:43">${cells}</row>`;
}

function extendDimension(sheetXml: string, lastRow: number) {
  return sheetXml.replace(/<dimension\b[^>]*\bref="([A-Z]+\d+):([A-Z]+)(\d+)"[^>]*\/>/, (all, first, lastColumn, oldLast) =>
    all.replace(`${first}:${lastColumn}${oldLast}`, `${first}:${lastColumn}${Math.max(Number(oldLast), lastRow)}`),
  );
}

async function xml(zip: JSZip, path: string) {
  const file = zip.file(path);
  if (!file) throw new Error(`XLSX_PART_MISSING:${path}`);
  return file.async("string");
}

async function resolveSheet(zip: JSZip, workbook: string, rels: string, name: string) {
  const id = sheetRelationshipId(workbook, name);
  if (!id) throw new Error(`XLSX_SHEET_MISSING:${name}`);
  const target = relationshipTarget(rels, id);
  if (!target) throw new Error(`XLSX_SHEET_RELATIONSHIP_MISSING:${name}`);
  return normalizeZipPath("xl", target);
}

async function resolveTable(zip: JSZip, sheetPath: string) {
  const slash = sheetPath.lastIndexOf("/");
  const directory = sheetPath.slice(0, slash);
  const filename = sheetPath.slice(slash + 1);
  const relPath = `${directory}/_rels/${filename}.rels`;
  const rels = await xml(zip, relPath);
  const tableRel = (rels.match(/<Relationship\b[^>]*\/>/g) ?? []).find((tag) =>
    /relationships\/table"/.test(tag),
  );
  const target = tableRel?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error("XLSX_DATA_TABLE_MISSING");
  return normalizeZipPath(directory, target);
}

function addCancelledCatalogValue(sheetXml: string) {
  if (sheetXml.includes(escapeXml(CANCELLED_DATA_STATUS))) return sheetXml;
  const rowNumber = 12;
  const existing = readRow(sheetXml, 11);
  const style = stylesFromRow(existing).get("A");
  const added = `<row r="${rowNumber}" spans="1:3">${cellXml(`A${rowNumber}`, CANCELLED_DATA_STATUS, style)}</row>`;
  const withRow = replaceOrAppendRow(sheetXml, rowNumber, added);
  return extendDimension(withRow, rowNumber);
}

export async function buildUpdatedDebitWorkbook(
  baseBuffer: Buffer,
  plan: DebitReconciliationPlan,
) {
  const zip = await JSZip.loadAsync(baseBuffer);
  let workbook = await xml(zip, "xl/workbook.xml");
  const workbookRels = await xml(zip, "xl/_rels/workbook.xml.rels");
  const dataPath = await resolveSheet(zip, workbook, workbookRels, "DATA");
  const tablePath = await resolveTable(zip, dataPath);
  let dataSheet = await xml(zip, dataPath);
  let table = await xml(zip, tablePath);

  const tableRef = table.match(/\bref="A1:AQ(\d+)"/)?.[1];
  if (!tableRef || Number(tableRef) !== plan.tableLastRow) {
    throw new Error("XLSX_DATA_TABLE_RANGE_MISMATCH");
  }
  const templateStyles = stylesFromRow(readRow(dataSheet, plan.tableLastRow));
  for (const update of plan.statusUpdates) {
    const target = plan.effectiveRows.find((row) => row.workbookRow === update.workbookRow);
    if (!target || target.origin === "NEW") continue;
    const current = readRow(dataSheet, update.workbookRow);
    if (!current) throw new Error(`XLSX_DATA_ROW_MISSING:${update.workbookRow}`);
    let patched = replaceCellInRow(current, update.workbookRow, "AH", target.cells[33]);
    if (target.deliveryDate) {
      patched = replaceCellInRow(patched, update.workbookRow, "AL", target.deliveryDate);
    }
    dataSheet = replaceOrAppendRow(dataSheet, update.workbookRow, patched);
  }
  for (const addition of plan.additions) {
    dataSheet = replaceOrAppendRow(
      dataSheet,
      addition.workbookRow,
      rowXml(addition, templateStyles),
    );
  }

  const lastRow = plan.tableLastRow + plan.additions.length;
  dataSheet = extendDimension(dataSheet, lastRow)
    .replace(/AJ2:AJ\d+/g, `AJ2:AJ${lastRow}`)
    .replace(/AH2:AH\d+/g, `AH2:AH${lastRow}`);
  table = table
    .replace(/\bref="A1:AQ\d+"/g, `ref="A1:AQ${lastRow}"`)
    .replace(/<autoFilter\b[^>]*\bref="A1:AQ\d+"/g, (tag) =>
      tag.replace(/ref="A1:AQ\d+"/, `ref="A1:AQ${lastRow}"`),
    );
  zip.file(dataPath, dataSheet);
  zip.file(tablePath, table);

  if (plan.requiresCancelledCatalogValue) {
    const listPath = await resolveSheet(zip, workbook, workbookRels, "LISTA");
    zip.file(listPath, addCancelledCatalogValue(await xml(zip, listPath)));
  }

  workbook = workbook.replace(/<calcPr\b([^>]*)\/>/, (_all, attrs: string) => {
    const cleaned = attrs
      .replace(/\sfullCalcOnLoad="[^"]*"/g, "")
      .replace(/\sforceFullCalc="[^"]*"/g, "")
      .replace(/\scalcMode="[^"]*"/g, "");
    return `<calcPr${cleaned} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
  });
  zip.file("xl/workbook.xml", workbook);
  for (const path of Object.keys(zip.files).filter((name) =>
    /^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/.test(name),
  )) {
    const pivot = await xml(zip, path);
    zip.file(
      path,
      pivot.replace(/<pivotCacheDefinition\b([^>]*)>/, (_all, attrs: string) => {
        const cleaned = attrs.replace(/\srefreshOnLoad="[^"]*"/g, "");
        return `<pivotCacheDefinition${cleaned} refreshOnLoad="1">`;
      }),
    );
  }
  return Buffer.from(
    await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
  );
}
