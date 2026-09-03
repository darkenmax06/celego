import { CANCELLED_DATA_STATUS } from "./constants";
import {
  parseConsolidatedWorkbook,
  parseNewCardsWorkbook,
  parseStatusWorkbook,
} from "./parser";
import {
  debitRowKey,
  type DebitCardStatus,
  type DebitConsolidatedRow,
  type DebitExternalStatusRow,
  type DebitIssue,
  type DebitReconciliationPlan,
  type DebitStatusEventPlan,
  type DebitStatusUpdate,
} from "./types";
import { dateKey, normalizeStatusKey } from "./value";

type ExternalResolution = {
  aggregateStatus: "delivered" | "canceled" | "created" | "transit" | "station" | "wait";
  cardStatus: DebitCardStatus;
  dataStatus: string;
  returnReason: string | null;
  priority: number;
};

const EXTERNAL_STATUS_MAP: Record<string, ExternalResolution> = {
  DELIVERED: {
    aggregateStatus: "delivered",
    cardStatus: "ENTREGADA",
    dataStatus: "TD- ENTREGADO",
    returnReason: null,
    priority: 3,
  },
  CANCELED: {
    aggregateStatus: "canceled",
    cardStatus: "RETORNADA",
    dataStatus: CANCELLED_DATA_STATUS,
    returnReason: "Orden anulada",
    priority: 2,
  },
  CANCELLED: {
    aggregateStatus: "canceled",
    cardStatus: "RETORNADA",
    dataStatus: CANCELLED_DATA_STATUS,
    returnReason: "Orden anulada",
    priority: 2,
  },
  CREATED: {
    aggregateStatus: "created",
    cardStatus: "DESPACHADA",
    dataStatus: "EN PROCESO",
    returnReason: null,
    priority: 1,
  },
  TRANSIT: {
    aggregateStatus: "transit",
    cardStatus: "EN_RUTA",
    dataStatus: "EN RUTA",
    returnReason: null,
    priority: 1,
  },
  STATION: {
    aggregateStatus: "station",
    cardStatus: "EN_RUTA",
    dataStatus: "EN RUTA",
    returnReason: null,
    priority: 1,
  },
  WAIT: {
    aggregateStatus: "wait",
    cardStatus: "EN_RUTA",
    dataStatus: "EN RUTA",
    returnReason: null,
    priority: 1,
  },
};

export function mapExternalDebitStatus(value: unknown) {
  return EXTERNAL_STATUS_MAP[normalizeStatusKey(value)] ?? null;
}

function issue(
  severity: DebitIssue["severity"],
  sourceFile: string,
  code: string,
  message: string,
  options: Pick<DebitIssue, "sheet" | "rowNumber" | "requestNumber"> = {},
): DebitIssue {
  return { severity, sourceFile, code, message, ...options };
}

function epoch(value: Date | null) {
  return value?.getTime() ?? 0;
}

function selectedStatusForGroup(
  rows: Array<{ row: DebitExternalStatusRow; resolution: ExternalResolution }>,
) {
  return [...rows].sort((left, right) => {
    const priority = right.resolution.priority - left.resolution.priority;
    if (priority) return priority;
    const movement = epoch(right.row.movementAt) - epoch(left.row.movementAt);
    if (movement) return movement;
    return right.row.sourceRow - left.row.sourceRow;
  })[0];
}

function effectiveResolution(
  current: DebitConsolidatedRow,
  selected: ExternalResolution,
): ExternalResolution {
  if (current.cardStatus === "ENTREGADA") {
    return {
      aggregateStatus: "delivered",
      cardStatus: "ENTREGADA",
      dataStatus: current.statusRaw,
      returnReason: null,
      priority: 3,
    };
  }
  if (current.cardStatus === "RETORNADA" && selected.cardStatus !== "ENTREGADA") {
    return {
      aggregateStatus: "canceled",
      cardStatus: "RETORNADA",
      dataStatus: current.statusRaw,
      returnReason: current.returnReason,
      priority: 2,
    };
  }
  return selected;
}

function applySelectedStatus(
  row: DebitConsolidatedRow,
  selectedRow: DebitExternalStatusRow,
  selected: ExternalResolution,
): DebitStatusUpdate {
  const previousStatus = row.statusRaw;
  const effective = effectiveResolution(row, selected);
  const nextDeliveryDate =
    effective.cardStatus === "ENTREGADA"
      ? row.deliveryDate ?? selectedRow.movementAt
      : row.deliveryDate;
  row.statusRaw = effective.dataStatus;
  row.cardStatus = effective.cardStatus;
  row.returnReason = effective.returnReason;
  row.deliveryDate = nextDeliveryDate;
  row.cells[33] = effective.dataStatus;
  if (effective.cardStatus === "ENTREGADA" && !row.cells[37] && nextDeliveryDate) {
    row.cells[37] = nextDeliveryDate;
  }
  return {
    requestNumber: row.requestNumber,
    workbookRow: row.workbookRow,
    previousStatus,
    nextStatus: effective.dataStatus,
    cardStatus: effective.cardStatus,
    returnReason: effective.returnReason,
    deliveryDate: nextDeliveryDate,
    selectedTrackingNumber: selectedRow.trackingNumber,
    selectedMovementAt: selectedRow.movementAt,
    changed:
      normalizeStatusKey(previousStatus) !== normalizeStatusKey(effective.dataStatus) ||
      (effective.cardStatus === "ENTREGADA" && !row.deliveryDate && Boolean(nextDeliveryDate)),
  };
}

export type ReconcileDebitFilesInput = {
  base: { buffer: Buffer; name: string };
  dispatchDate: Date;
  newCards?: { buffer: Buffer; name: string } | null;
  statusReport?: { buffer: Buffer; name: string } | null;
};

export function reconcileDebitFiles(input: ReconcileDebitFilesInput): DebitReconciliationPlan {
  const base = parseConsolidatedWorkbook(input.base.buffer, input.base.name);
  const issues = [...base.issues];
  const baseRows = base.rows.map((row) => ({ ...row, cells: [...row.cells] }));
  const identity = new Map<string, DebitConsolidatedRow>();
  for (const row of baseRows) {
    const key = debitRowKey(row);
    const duplicate = identity.get(key);
    if (duplicate) {
      issues.push(
        issue(
          "BLOCKING",
          input.base.name,
          "DUPLICATE_BASE_IDENTITY",
          `La solicitud ${row.requestNumber} ya existe para el despacho ${dateKey(row.dispatchDate)} (filas ${duplicate.workbookRow} y ${row.workbookRow})`,
          { sheet: "DATA", rowNumber: row.workbookRow, requestNumber: row.requestNumber },
        ),
      );
    } else {
      identity.set(key, row);
    }
  }

  const additions: DebitConsolidatedRow[] = [];
  let additionsInput = 0;
  let additionsDuplicate = 0;
  if (input.newCards) {
    const parsed = parseNewCardsWorkbook(
      input.newCards.buffer,
      input.newCards.name,
      input.dispatchDate,
      base.tableLastRow + 1,
    );
    issues.push(...parsed.issues);
    additionsInput = parsed.rows.length + parsed.issues.filter((item) => item.rowNumber).length;
    const cedulas = new Map<string, Set<string>>();
    for (const row of baseRows) {
      const requests = cedulas.get(row.cedula) ?? new Set<string>();
      requests.add(row.requestNumber);
      cedulas.set(row.cedula, requests);
    }
    for (const candidate of parsed.rows) {
      const key = debitRowKey(candidate);
      const existing = identity.get(key);
      if (existing) {
        additionsDuplicate += 1;
        issues.push(
          issue(
            "WARNING",
            input.newCards.name,
            "NEW_CARD_ALREADY_EXISTS",
            `La solicitud ${candidate.requestNumber} ya existe para el despacho ${dateKey(candidate.dispatchDate)}; no se duplicará`,
            {
              sheet: parsed.sheetName ?? undefined,
              rowNumber: candidate.sourceRow,
              requestNumber: candidate.requestNumber,
            },
          ),
        );
        continue;
      }
      const otherRequests = cedulas.get(candidate.cedula);
      if (otherRequests?.size && !otherRequests.has(candidate.requestNumber)) {
        issues.push(
          issue(
            "WARNING",
            input.newCards.name,
            "SAME_CUSTOMER_DIFFERENT_REQUEST",
            `La cédula ${candidate.cedula} ya tiene otra solicitud; se conservarán ambas`,
            {
              sheet: parsed.sheetName ?? undefined,
              rowNumber: candidate.sourceRow,
              requestNumber: candidate.requestNumber,
            },
          ),
        );
      }
      candidate.workbookRow = base.tableLastRow + additions.length + 1;
      additions.push(candidate);
      identity.set(key, candidate);
      const requests = otherRequests ?? new Set<string>();
      requests.add(candidate.requestNumber);
      cedulas.set(candidate.cedula, requests);
    }
  }

  const effectiveRows = [...baseRows, ...additions];
  const byRequest = new Map<string, DebitConsolidatedRow[]>();
  for (const row of effectiveRows) {
    const rows = byRequest.get(row.requestNumber) ?? [];
    rows.push(row);
    byRequest.set(row.requestNumber, rows);
  }

  const statusUpdates: DebitStatusUpdate[] = [];
  const statusEvents: DebitStatusEventPlan[] = [];
  let statusRows = 0;
  let statusMatched = 0;
  let statusUnmatched = 0;
  if (input.statusReport) {
    const parsed = parseStatusWorkbook(input.statusReport.buffer, input.statusReport.name);
    issues.push(...parsed.issues);
    statusRows = parsed.rows.length + parsed.issues.filter((item) => item.rowNumber).length;
    const groups = new Map<string, DebitExternalStatusRow[]>();
    for (const row of parsed.rows) {
      const group = groups.get(row.requestNumber) ?? [];
      group.push(row);
      groups.set(row.requestNumber, group);
    }
    for (const [requestNumber, group] of groups) {
      const mapped = group.flatMap((row) => {
        const resolution = mapExternalDebitStatus(row.externalStatus);
        if (!resolution) {
          issues.push(
            issue(
              "ROW_ERROR",
              input.statusReport!.name,
              "EXTERNAL_STATUS_UNKNOWN",
              `Status externo sin mapeo: ${row.externalStatus || "(vacío)"}`,
              {
                sheet: parsed.sheetName ?? undefined,
                rowNumber: row.sourceRow,
                requestNumber,
              },
            ),
          );
          statusEvents.push({
            ...row,
            matchedRowKey: null,
            aggregateStatus: "unknown",
            selected: false,
          });
          return [];
        }
        return [{ row, resolution }];
      });
      if (!mapped.length) continue;

      const trackingNumbers = new Set(mapped.map(({ row }) => row.trackingNumber).filter(Boolean));
      if (trackingNumbers.size > 1) {
        issues.push(
          issue(
            "WARNING",
            input.statusReport.name,
            "MULTIPLE_TRACKING_NUMBERS",
            `La solicitud aparece con ${trackingNumbers.size} números de tracking`,
            { sheet: parsed.sheetName ?? undefined, requestNumber },
          ),
        );
      }
      const byTimestamp = new Map<number, Set<string>>();
      for (const item of mapped) {
        const statuses = byTimestamp.get(epoch(item.row.movementAt)) ?? new Set<string>();
        statuses.add(item.resolution.aggregateStatus);
        byTimestamp.set(epoch(item.row.movementAt), statuses);
      }
      if ([...byTimestamp.values()].some((statuses) => statuses.size > 1)) {
        issues.push(
          issue(
            "BLOCKING",
            input.statusReport.name,
            "INCOMPATIBLE_STATUS_TIE",
            "La solicitud tiene estados incompatibles con la misma fecha de movimiento",
            { sheet: parsed.sheetName ?? undefined, requestNumber },
          ),
        );
        for (const item of mapped) {
          statusEvents.push({
            ...item.row,
            matchedRowKey: null,
            aggregateStatus: item.resolution.aggregateStatus,
            selected: false,
          });
        }
        continue;
      }

      const selected = selectedStatusForGroup(mapped);
      const targets = byRequest.get(requestNumber) ?? [];
      if (!targets.length) {
        statusUnmatched += 1;
        issues.push(
          issue(
            "WARNING",
            input.statusReport.name,
            "STATUS_REQUEST_NOT_FOUND",
            "La solicitud no existe en el consolidado efectivo",
            { sheet: parsed.sheetName ?? undefined, requestNumber },
          ),
        );
      } else if (targets.length > 1) {
        issues.push(
          issue(
            "BLOCKING",
            input.statusReport.name,
            "STATUS_REQUEST_AMBIGUOUS",
            "La solicitud corresponde a más de una fecha de despacho y no puede actualizarse sin ambigüedad",
            { sheet: parsed.sheetName ?? undefined, requestNumber },
          ),
        );
      } else {
        statusMatched += 1;
        statusUpdates.push(applySelectedStatus(targets[0], selected.row, selected.resolution));
      }
      const matchedKey = targets.length === 1 ? debitRowKey(targets[0]) : null;
      for (const item of mapped) {
        statusEvents.push({
          ...item.row,
          matchedRowKey: matchedKey,
          aggregateStatus: item.resolution.aggregateStatus,
          selected: item === selected,
        });
      }
    }
  }

  const warnings = issues.filter((item) => item.severity === "WARNING").length;
  const rowErrors = issues.filter((item) => item.severity === "ROW_ERROR").length;
  const blocking = issues.filter((item) => item.severity === "BLOCKING").length;
  return {
    baseRows,
    additions,
    effectiveRows,
    statusUpdates,
    statusEvents,
    issues,
    tableLastRow: base.tableLastRow,
    requiresCancelledCatalogValue: statusUpdates.some(
      (item) => item.nextStatus === CANCELLED_DATA_STATUS,
    ),
    counts: {
      baseRows: base.rows.length + base.issues.filter((item) => item.rowNumber).length,
      baseValidRows: base.rows.length,
      additionsInput,
      additionsAdded: additions.length,
      additionsDuplicate,
      statusRows,
      statusUniqueRequests: new Set(statusEvents.map((item) => item.requestNumber)).size,
      statusMatched,
      statusUnmatched,
      statusChanged: statusUpdates.filter((item) => item.changed).length,
      statusUnchanged: statusUpdates.filter((item) => !item.changed).length,
      projectedRows: effectiveRows.length,
      warnings,
      rowErrors,
      blocking,
    },
  };
}

export function reconciliationDifferences(plan: DebitReconciliationPlan) {
  const selectedEvents = new Map(
    plan.statusEvents
      .filter((event) => event.selected)
      .map((event) => [event.requestNumber, event.externalStatus]),
  );
  return plan.statusUpdates.map((update) => ({
    requestNumber: update.requestNumber,
    previousStatus: update.previousStatus,
    externalStatus: selectedEvents.get(update.requestNumber) ?? "",
    resultStatus: update.nextStatus,
    changed: update.changed,
  }));
}
