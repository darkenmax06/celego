export type DebitIssueSeverity = "WARNING" | "ROW_ERROR" | "BLOCKING";

export type DebitIssue = {
  sourceFile: string;
  sheet?: string;
  rowNumber?: number;
  requestNumber?: string;
  severity: DebitIssueSeverity;
  code: string;
  message: string;
};

export type DebitCardStatus =
  | "DESPACHADA"
  | "EN_RUTA"
  | "ENTREGADA"
  | "RETORNADA";

export type WorkbookCellValue = string | number | Date | null;

export type DebitConsolidatedRow = {
  workbookRow: number;
  sourceRow: number;
  origin: "BASE" | "NEW";
  requestNumber: string;
  dispatchDate: Date;
  cedula: string;
  nombre: string;
  provincia: string;
  municipio: string;
  direccion: string;
  telefonos: string;
  externalReference: string;
  statusRaw: string;
  cardStatus: DebitCardStatus;
  returnReason: string | null;
  deliveryDate: Date | null;
  cells: WorkbookCellValue[];
  sourceSnapshot: Record<string, WorkbookCellValue>;
};

export type DebitExternalStatusRow = {
  sourceRow: number;
  requestNumber: string;
  trackingNumber: string;
  externalStatus: string;
  movementAt: Date | null;
  operator: string;
  notes: string;
};

export type DebitStatusUpdate = {
  requestNumber: string;
  workbookRow: number;
  previousStatus: string;
  nextStatus: string;
  cardStatus: DebitCardStatus;
  returnReason: string | null;
  deliveryDate: Date | null;
  selectedTrackingNumber: string;
  selectedMovementAt: Date | null;
  changed: boolean;
};

export type DebitStatusEventPlan = DebitExternalStatusRow & {
  matchedRowKey: string | null;
  aggregateStatus: string;
  selected: boolean;
};

export type DebitConsolidationCounts = {
  baseRows: number;
  baseValidRows: number;
  additionsInput: number;
  additionsAdded: number;
  additionsDuplicate: number;
  statusRows: number;
  statusUniqueRequests: number;
  statusMatched: number;
  statusUnmatched: number;
  statusChanged: number;
  statusUnchanged: number;
  projectedRows: number;
  warnings: number;
  rowErrors: number;
  blocking: number;
};

export type DebitReconciliationPlan = {
  baseRows: DebitConsolidatedRow[];
  additions: DebitConsolidatedRow[];
  effectiveRows: DebitConsolidatedRow[];
  statusUpdates: DebitStatusUpdate[];
  statusEvents: DebitStatusEventPlan[];
  issues: DebitIssue[];
  counts: DebitConsolidationCounts;
  tableLastRow: number;
  requiresCancelledCatalogValue: boolean;
};

export type DebitPreviewResponse = {
  runId: string;
  validationToken: string;
  status: string;
  counts: DebitConsolidationCounts;
  issues: DebitIssue[];
  differences: Array<{
    requestNumber: string;
    previousStatus: string;
    externalStatus: string;
    resultStatus: string;
    changed: boolean;
  }>;
  duplicateCompletedRunId: string | null;
  canApply: boolean;
};

export function debitRowKey(row: Pick<DebitConsolidatedRow, "requestNumber" | "dispatchDate">) {
  return `${row.requestNumber}|${row.dispatchDate.toISOString().slice(0, 10)}`;
}
