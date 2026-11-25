import { CardStatus } from "@prisma/client";
import { readWorkbook, getSheetRows, findHeaderRow, mapHeaderIndex, getCell } from "@/lib/importers/workbook";
import { parseExcelSerialDate } from "@/lib/date";
import { mapPinitExportStatus } from "@/lib/debit-status";
import { normalizeDebitRequestNumber, invalidDebitRequestNumberMessage } from "@/lib/importers/debit-request-number";

export type ParsedDebitPinitRow = {
  requestNumber: string;
  trackingNumber: string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  rawStatus: string;
  mappedStatus: CardStatus | null;
  deliveryDate: Date | null;
  recipientName: string | null;
  messengerName: string | null;
  messengerEmail: string | null;
  attemptsCount: number;
  lastAttemptNotes: string | null;
  sourceRowNumber: number;
};

export type DebitPinitImportResult = {
  rows: ParsedDebitPinitRow[];
  errors: Array<{ row: number; message: string }>;
  headerRowIndex: number;
};

// The Pinit backup report lists up to 5 attempts per order in repeated column groups.
const MAX_BACKUP_ATTEMPTS = 5;

function cleanStr(val: unknown): string {
  if (val == null) return "";
  return String(val).trim();
}

/**
 * Parses either the Pinit backup report (every order of the client, including the
 * ones delivered from the store without a messenger scan) or the older
 * "piezas operadas" deliveries export.
 */
export function parseDebitPinitImport(buffer: Buffer): DebitPinitImportResult {
  const workbook = readWorkbook(buffer);
  const sheetName = workbook.SheetNames[0];
  const rows = getSheetRows(workbook, sheetName);

  const requiredHeaderAliases = [
    ["No. de orden", "NO. DE ORDEN", "NO_DE_ORDEN", "ORDEN", "N-SS", "NRO_SS"],
    ["Estatus de la orden", "ESTATUS DE LA ORDEN", "ESTATUS", "STATUS", "Último estatus operativo"],
  ];

  const headerRowIndex = findHeaderRow(rows, requiredHeaderAliases, 40);
  if (headerRowIndex < 0) {
    throw new Error("No se pudo detectar el encabezado del archivo de Export de Entregas Pinit");
  }

  const header = rows[headerRowIndex];
  const idx = {
    orderId: mapHeaderIndex(header, ["Order Id"]),
    orderNumber: mapHeaderIndex(header, ["No. de orden", "NO. DE ORDEN", "NO_DE_ORDEN", "ORDEN", "N-SS", "NRO_SS"]),
    // Backup report: when "No. de orden" holds the cedula, the request number is here.
    altTracking: mapHeaderIndex(header, ["Tracking number alternativo"]),
    trackingNumber: mapHeaderIndex(header, ["Tracking number", "TRACKING NUMBER", "TRACKING"]),
    cliente: mapHeaderIndex(header, ["Cliente", "CLIENTE", "Nombre", "Nombre(s) del cliente"]),
    telefono: mapHeaderIndex(header, ["Telefono cliente", "TELEFONO CLIENTE", "Telefono"]),
    celular: mapHeaderIndex(header, ["Celular"]),
    direccion: mapHeaderIndex(header, ["Dirección cliente", "DIRECCION CLIENTE", "Direccion", "Calle[*]"]),
    fechaEntrega: mapHeaderIndex(header, ["Fecha de entrega", "FECHA DE ENTREGA", "Fecha entrega"]),
    estatusOrden: mapHeaderIndex(header, ["Estatus de la orden", "ESTATUS DE LA ORDEN", "Estatus"]),
    ultimoEstatusOperativo: mapHeaderIndex(header, ["Último estatus operativo", "ULTIMO ESTATUS OPERATIVO"]),
    quienRecibe: mapHeaderIndex(header, ["Nombre de quien recibe", "NOMBRE DE QUIEN RECIBE", "Recibe"]),
    usuarioUltimoEstatus: mapHeaderIndex(header, ["Usuario de último estatus", "USUARIO DE ULTIMO ESTATUS", "Mensajero"]),
    emailUsuario: mapHeaderIndex(header, ["Email de usuario de último estatus", "EMAIL USUARIO"]),
    intentos: mapHeaderIndex(header, ["# intentos", "INTENTOS", "NUMERO DE INTENTOS"]),
    notasUltimoIntento: mapHeaderIndex(header, ["Notas último intento", "NOTAS ULTIMO INTENTO", "Notas"]),
    fechaEliminacion: mapHeaderIndex(header, ["Fecha de eliminación"]),
  };

  const attemptIdx = Array.from({ length: MAX_BACKUP_ATTEMPTS }, (_, k) => {
    const n = k + 1;
    return {
      fecha: mapHeaderIndex(header, [`Fecha de intento ${n}`]),
      email: mapHeaderIndex(header, [`Email operador intento ${n}`]),
      nombre: mapHeaderIndex(header, [`Nombre operador intento ${n}`]),
      recibe: mapHeaderIndex(header, [`Entregado a (Intento ${n})`]),
      motivo: mapHeaderIndex(header, [`Motivo de retorno (Intento ${n})`]),
    };
  }).filter((a) => a.fecha >= 0);
  const isBackup = attemptIdx.length > 0;

  const byRequest = new Map<string, { row: ParsedDebitPinitRow; orderId: number }>();
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const rawOrder = getCell(row, idx.orderNumber);
    const rawAlt = getCell(row, idx.altTracking);
    if (!rawOrder && !rawAlt) continue;

    const requestNumber = normalizeDebitRequestNumber(rawOrder) ?? normalizeDebitRequestNumber(rawAlt);
    if (!requestNumber) {
      errors.push({ row: i + 1, message: invalidDebitRequestNumberMessage("No. de orden", rawOrder || rawAlt) });
      continue;
    }

    const deletedAt = getCell(row, idx.fechaEliminacion);
    if (deletedAt && deletedAt.toLowerCase() !== "no eliminada") {
      errors.push({ row: i + 1, message: `Orden ${requestNumber} eliminada en Pinit; se omite la fila` });
      continue;
    }

    const rawStatus = cleanStr(getCell(row, idx.estatusOrden)) || cleanStr(getCell(row, idx.ultimoEstatusOperativo));
    const mappedStatus = mapPinitExportStatus(rawStatus);

    let deliveryDate: Date | null;
    let recipientName: string | null;
    let messengerName: string | null;
    let messengerEmail: string | null;
    let attemptsCount: number;
    let lastAttemptNotes: string | null;

    if (isBackup) {
      const attempts = attemptIdx.filter((a) => getCell(row, a.fecha));
      const last = attempts[attempts.length - 1];
      attemptsCount = attempts.length;
      recipientName = (last && getCell(row, last.recibe)) || null;
      messengerName = (last && getCell(row, last.nombre)) || null;
      messengerEmail = (last && getCell(row, last.email)) || null;
      lastAttemptNotes = (last && getCell(row, last.motivo)) || null;
      // The backup has no delivery-date column: a delivered order was delivered on its last attempt.
      deliveryDate = mappedStatus === CardStatus.TD_ENTREGADO && last ? parseExcelSerialDate(getCell(row, last.fecha)) : null;
    } else {
      deliveryDate = parseExcelSerialDate(getCell(row, idx.fechaEntrega));
      recipientName = cleanStr(getCell(row, idx.quienRecibe)) || null;
      messengerName = cleanStr(getCell(row, idx.usuarioUltimoEstatus)) || null;
      messengerEmail = cleanStr(getCell(row, idx.emailUsuario)) || null;
      attemptsCount = Number(cleanStr(getCell(row, idx.intentos))) || 0;
      lastAttemptNotes = cleanStr(getCell(row, idx.notasUltimoIntento)) || null;
    }

    const parsedRow: ParsedDebitPinitRow = {
      requestNumber,
      trackingNumber: cleanStr(getCell(row, idx.trackingNumber)) || null,
      customerName: cleanStr(getCell(row, idx.cliente)),
      customerPhone: cleanStr(getCell(row, idx.celular)) || cleanStr(getCell(row, idx.telefono)) || null,
      customerAddress: cleanStr(getCell(row, idx.direccion)) || null,
      rawStatus,
      mappedStatus,
      deliveryDate,
      recipientName,
      messengerName,
      messengerEmail,
      attemptsCount,
      lastAttemptNotes,
      sourceRowNumber: i + 1,
    };

    // Pinit can hold the same request number twice (order re-created): keep the newest order.
    const orderId = Number(getCell(row, idx.orderId)) || i;
    const existing = byRequest.get(requestNumber);
    if (existing) {
      const [kept, dropped] = orderId > existing.orderId ? [parsedRow, existing.row] : [existing.row, parsedRow];
      errors.push({
        row: dropped.sourceRowNumber,
        message: `Solicitud ${requestNumber} duplicada; se usa la orden mas reciente (fila ${kept.sourceRowNumber})`,
      });
      if (kept === existing.row) continue;
    }
    byRequest.set(requestNumber, { row: parsedRow, orderId });
  }

  const parsed = [...byRequest.values()].map((v) => v.row).sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
  return { rows: parsed, errors, headerRowIndex };
}
