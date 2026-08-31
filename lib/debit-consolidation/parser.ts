import {
  DATA_HEADERS,
  LEGACY_STATUS_MAP,
  NEW_CARD_HEADERS,
  STATUS_REPORT_REQUIRED_HEADERS,
  type LegacyStatusResolution,
} from "./constants";
import type {
  DebitConsolidatedRow,
  DebitExternalStatusRow,
  DebitIssue,
  WorkbookCellValue,
} from "./types";
import {
  asSnapshot,
  cellText,
  isValidRequestNumber,
  normalizeStatusKey,
  normalizeWorkbookHeader,
  parseWorkbookDate,
  workbookRows,
  workbookSheetNames,
} from "./value";

type ParsedRows<T> = {
  rows: T[];
  issues: DebitIssue[];
  sheetName: string | null;
};

function blockingIssue(sourceFile: string, code: string, message: string): DebitIssue {
  return { sourceFile, severity: "BLOCKING", code, message };
}

function rowIssue(
  sourceFile: string,
  sheet: string,
  rowNumber: number,
  requestNumber: string,
  code: string,
  message: string,
): DebitIssue {
  return {
    sourceFile,
    sheet,
    rowNumber,
    requestNumber: requestNumber || undefined,
    severity: "ROW_ERROR",
    code,
    message,
  };
}

function normalizedHeaders(row: readonly WorkbookCellValue[]) {
  return row.map(normalizeWorkbookHeader);
}

function exactHeaderMatch(actual: readonly WorkbookCellValue[], expected: readonly string[]) {
  const normalized = normalizedHeaders(actual);
  return expected.every(
    (header, index) => normalized[index] === normalizeWorkbookHeader(header),
  );
}

function headerIndexMap(actual: readonly WorkbookCellValue[]) {
  return new Map(normalizedHeaders(actual).map((header, index) => [header, index]));
}

function findSheetByHeaders(
  buffer: Buffer,
  preferredName: string,
  requiredHeaders: readonly string[],
) {
  const names = workbookSheetNames(buffer);
  const ordered = [preferredName, ...names.filter((name) => name !== preferredName)];
  for (const name of ordered) {
    const rows = workbookRows(buffer, name);
    if (!rows?.length) continue;
    const index = headerIndexMap(rows[0]);
    if (requiredHeaders.every((header) => index.has(normalizeWorkbookHeader(header)))) {
      return { sheetName: name, rows };
    }
  }
  return null;
}

function phonesFromCells(cells: readonly WorkbookCellValue[]) {
  return [22, 25, 28]
    .map((index) => cellText(cells[index]))
    .filter((value) => value && value !== "0")
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" | ");
}

export function mapLegacyStatus(value: unknown): LegacyStatusResolution | null {
  return LEGACY_STATUS_MAP[normalizeStatusKey(value)] ?? null;
}

function consolidatedRowFromCells(args: {
  cells: WorkbookCellValue[];
  workbookRow: number;
  sourceRow: number;
  origin: "BASE" | "NEW";
  sourceHeaders: readonly string[];
}) {
  const { cells, workbookRow, sourceRow, origin, sourceHeaders } = args;
  const requestNumber = cellText(cells[1]);
  const dispatchDate = parseWorkbookDate(cells[0]);
  const statusRaw = cellText(cells[33]);
  const status = mapLegacyStatus(statusRaw);
  if (!dispatchDate || !status) return null;
  return {
    workbookRow,
    sourceRow,
    origin,
    requestNumber,
    dispatchDate,
    cedula: cellText(cells[6]),
    nombre: cellText(cells[7]),
    provincia: cellText(cells[12]),
    municipio: cellText(cells[13]),
    direccion: cellText(cells[11]),
    telefonos: phonesFromCells(cells),
    externalReference: cellText(cells[20]),
    statusRaw,
    cardStatus: status.cardStatus,
    returnReason: status.returnReason,
    deliveryDate: parseWorkbookDate(cells[37]),
    cells,
    sourceSnapshot: asSnapshot(sourceHeaders, cells),
  } satisfies DebitConsolidatedRow;
}

export function parseConsolidatedWorkbook(
  buffer: Buffer,
  sourceFile: string,
): ParsedRows<DebitConsolidatedRow> & { tableLastRow: number } {
  const rows = workbookRows(buffer, "DATA");
  if (!rows?.length) {
    return {
      rows: [],
      issues: [blockingIssue(sourceFile, "DATA_SHEET_MISSING", "No se encontró la hoja DATA")],
      sheetName: null,
      tableLastRow: 1,
    };
  }
  if (!exactHeaderMatch(rows[0], DATA_HEADERS)) {
    return {
      rows: [],
      issues: [
        blockingIssue(
          sourceFile,
          "DATA_HEADERS_INVALID",
          "La hoja DATA no conserva los 43 encabezados esperados en el orden requerido",
        ),
      ],
      sheetName: "DATA",
      tableLastRow: 1,
    };
  }

  const parsed: DebitConsolidatedRow[] = [];
  const issues: DebitIssue[] = [];
  let lastPopulatedRow = 1;
  for (let index = 1; index < rows.length; index += 1) {
    const cells = Array.from({ length: DATA_HEADERS.length }, (_, cellIndex) =>
      rows[index]?.[cellIndex] ?? null,
    );
    if (!cells.some((value) => cellText(value))) continue;
    const rowNumber = index + 1;
    lastPopulatedRow = rowNumber;
    const requestNumber = cellText(cells[1]);
    if (!isValidRequestNumber(requestNumber)) {
      issues.push(
        rowIssue(
          sourceFile,
          "DATA",
          rowNumber,
          requestNumber,
          "REQUEST_NUMBER_INVALID",
          "N-SS debe tener el formato 4- seguido de 11 dígitos",
        ),
      );
      continue;
    }
    if (!parseWorkbookDate(cells[0])) {
      issues.push(
        rowIssue(
          sourceFile,
          "DATA",
          rowNumber,
          requestNumber,
          "DISPATCH_DATE_INVALID",
          "FECH ASIG no contiene una fecha válida",
        ),
      );
      continue;
    }
    if (!cellText(cells[6])) {
      issues.push(
        rowIssue(
          sourceFile,
          "DATA",
          rowNumber,
          requestNumber,
          "CUSTOMER_ID_MISSING",
          "NRO_ID es obligatorio para sincronizar el cliente",
        ),
      );
      continue;
    }
    const legacyStatus = mapLegacyStatus(cells[33]);
    if (!legacyStatus) {
      issues.push(
        rowIssue(
          sourceFile,
          "DATA",
          rowNumber,
          requestNumber,
          "LEGACY_STATUS_UNKNOWN",
          `STATUS legado sin mapeo: ${cellText(cells[33]) || "(vacío)"}`,
        ),
      );
      continue;
    }
    const row = consolidatedRowFromCells({
      cells,
      workbookRow: rowNumber,
      sourceRow: rowNumber,
      origin: "BASE",
      sourceHeaders: DATA_HEADERS,
    });
    if (row) parsed.push(row);
  }

  return { rows: parsed, issues, sheetName: "DATA", tableLastRow: lastPopulatedRow };
}

function normalizeAuxiliaryDate(value: WorkbookCellValue) {
  return parseWorkbookDate(value) ?? 0;
}

export function parseNewCardsWorkbook(
  buffer: Buffer,
  sourceFile: string,
  dispatchDate: Date,
  firstWorkbookRow: number,
): ParsedRows<DebitConsolidatedRow> {
  const matched = findSheetByHeaders(buffer, "CELE", NEW_CARD_HEADERS.slice(0, 35));
  if (!matched) {
    return {
      rows: [],
      issues: [
        blockingIssue(
          sourceFile,
          "NEW_CARDS_HEADERS_INVALID",
          "No se encontró una hoja con los encabezados de nuevas tarjetas débito",
        ),
      ],
      sheetName: null,
    };
  }
  const { sheetName, rows } = matched;
  const indexes = headerIndexMap(rows[0]);
  const missing = NEW_CARD_HEADERS.filter(
    (header) => !indexes.has(normalizeWorkbookHeader(header)),
  );
  if (missing.length) {
    return {
      rows: [],
      issues: [
        blockingIssue(
          sourceFile,
          "NEW_CARDS_HEADERS_MISSING",
          `Faltan columnas: ${missing.join(", ")}`,
        ),
      ],
      sheetName,
    };
  }

  const parsed: DebitConsolidatedRow[] = [];
  const issues: DebitIssue[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const sourceCells = NEW_CARD_HEADERS.map(
      (header) => rows[index]?.[indexes.get(normalizeWorkbookHeader(header)) ?? -1] ?? null,
    );
    if (!sourceCells.some((value) => cellText(value))) continue;
    const sourceRow = index + 1;
    const requestNumber = cellText(sourceCells[0]);
    if (!isValidRequestNumber(requestNumber)) {
      issues.push(
        rowIssue(
          sourceFile,
          sheetName,
          sourceRow,
          requestNumber,
          "REQUEST_NUMBER_INVALID",
          "NRO_SS debe tener el formato 4- seguido de 11 dígitos",
        ),
      );
      continue;
    }
    if (!cellText(sourceCells[5])) {
      issues.push(
        rowIssue(
          sourceFile,
          sheetName,
          sourceRow,
          requestNumber,
          "CUSTOMER_ID_MISSING",
          "NRO_ID es obligatorio",
        ),
      );
      continue;
    }

    const sourceMotive = cellText(sourceCells[32]);
    const motiveResolution = mapLegacyStatus(sourceMotive);
    if (sourceMotive && !motiveResolution) {
      issues.push({
        sourceFile,
        sheet: sheetName,
        rowNumber: sourceRow,
        requestNumber,
        severity: "WARNING",
        code: "SOURCE_MOTIVE_IGNORED",
        message: `MOTIVO_DEL_CIERRE '${sourceMotive}' no es un estado consolidado; el alta inicia sin estado terminal`,
      });
    }

    const cells: WorkbookCellValue[] = [
      dispatchDate,
      ...sourceCells.slice(0, 31),
      sourceCells[31],
      motiveResolution?.normalizedDataStatus ?? "",
      sourceCells[33],
      sourceCells[34],
      normalizeAuxiliaryDate(sourceCells[35]),
      sourceCells[36],
      sourceCells[37],
      sourceCells[38],
      sourceCells[39],
      sourceCells[40],
      null,
    ];
    const workbookRow = firstWorkbookRow + parsed.length;
    const row = consolidatedRowFromCells({
      cells,
      workbookRow,
      sourceRow,
      origin: "NEW",
      sourceHeaders: DATA_HEADERS,
    });
    if (row) parsed.push(row);
  }
  return { rows: parsed, issues, sheetName };
}

export function parseStatusWorkbook(
  buffer: Buffer,
  sourceFile: string,
): ParsedRows<DebitExternalStatusRow> {
  const matched = findSheetByHeaders(buffer, "Sheet1", STATUS_REPORT_REQUIRED_HEADERS);
  if (!matched) {
    return {
      rows: [],
      issues: [
        blockingIssue(
          sourceFile,
          "STATUS_HEADERS_INVALID",
          "No se encontró una hoja con No. de orden, Status y Fecha de último movimiento",
        ),
      ],
      sheetName: null,
    };
  }
  const { sheetName, rows } = matched;
  const indexes = headerIndexMap(rows[0]);
  const getIndex = (header: string) => indexes.get(normalizeWorkbookHeader(header)) ?? -1;
  const parsed: DebitExternalStatusRow[] = [];
  const issues: DebitIssue[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row?.some((value) => cellText(value))) continue;
    const rowNumber = index + 1;
    const requestNumber = cellText(row[getIndex("No. de orden")]);
    if (!isValidRequestNumber(requestNumber)) {
      issues.push(
        rowIssue(
          sourceFile,
          sheetName,
          rowNumber,
          requestNumber,
          "REQUEST_NUMBER_INVALID",
          "No. de orden no contiene una solicitud débito válida",
        ),
      );
      continue;
    }
    const externalStatus = cellText(row[getIndex("Status")]);
    parsed.push({
      sourceRow: rowNumber,
      requestNumber,
      trackingNumber: cellText(row[getIndex("Tracking number")]),
      externalStatus,
      movementAt: parseWorkbookDate(row[getIndex("Fecha de último movimiento")]),
      operator: cellText(row[getIndex("Operador")]),
      notes: cellText(row[getIndex("Notas de último movimiento")]),
    });
  }
  return { rows: parsed, issues, sheetName };
}
