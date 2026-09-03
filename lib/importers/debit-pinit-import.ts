import { CardStatus } from "@prisma/client";
import { readWorkbook, getSheetRows, findHeaderRow, mapHeaderIndex, getCell } from "@/lib/importers/workbook";
import { parseExcelSerialDate } from "@/lib/date";
import { mapPinitExportStatus } from "@/lib/debit-status";

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

function cleanStr(val: unknown): string {
  if (val == null) return "";
  return String(val).trim();
}

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
    orderNumber: mapHeaderIndex(header, ["No. de orden", "NO. DE ORDEN", "NO_DE_ORDEN", "ORDEN", "N-SS", "NRO_SS"]),
    trackingNumber: mapHeaderIndex(header, ["Tracking number", "TRACKING NUMBER", "TRACKING"]),
    cliente: mapHeaderIndex(header, ["Cliente", "CLIENTE", "Nombre"]),
    telefono: mapHeaderIndex(header, ["Telefono cliente", "TELEFONO CLIENTE", "Telefono"]),
    direccion: mapHeaderIndex(header, ["Dirección cliente", "DIRECCION CLIENTE", "Direccion"]),
    fechaEntrega: mapHeaderIndex(header, ["Fecha de entrega", "FECHA DE ENTREGA", "Fecha entrega"]),
    estatusOrden: mapHeaderIndex(header, ["Estatus de la orden", "ESTATUS DE LA ORDEN", "Estatus"]),
    ultimoEstatusOperativo: mapHeaderIndex(header, ["Último estatus operativo", "ULTIMO ESTATUS OPERATIVO"]),
    quienRecibe: mapHeaderIndex(header, ["Nombre de quien recibe", "NOMBRE DE QUIEN RECIBE", "Recibe"]),
    usuarioUltimoEstatus: mapHeaderIndex(header, ["Usuario de último estatus", "USUARIO DE ULTIMO ESTATUS", "Mensajero"]),
    emailUsuario: mapHeaderIndex(header, ["Email de usuario de último estatus", "EMAIL USUARIO"]),
    intentos: mapHeaderIndex(header, ["# intentos", "INTENTOS", "NUMERO DE INTENTOS"]),
    notasUltimoIntento: mapHeaderIndex(header, ["Notas último intento", "NOTAS ULTIMO INTENTO", "Notas"]),
  };

  const parsed: ParsedDebitPinitRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const rawOrder = getCell(row, idx.orderNumber);
    if (!rawOrder) continue;

    const requestNumber = cleanStr(rawOrder);
    const trackingNumber = cleanStr(getCell(row, idx.trackingNumber)) || null;
    const customerName = cleanStr(getCell(row, idx.cliente));
    const customerPhone = cleanStr(getCell(row, idx.telefono)) || null;
    const customerAddress = cleanStr(getCell(row, idx.direccion)) || null;

    const rawStatus = cleanStr(getCell(row, idx.estatusOrden)) || cleanStr(getCell(row, idx.ultimoEstatusOperativo));
    const mappedStatus = mapPinitExportStatus(rawStatus);

    const rawFechaEntrega = getCell(row, idx.fechaEntrega);
    const deliveryDate = parseExcelSerialDate(rawFechaEntrega);

    const recipientName = cleanStr(getCell(row, idx.quienRecibe)) || null;
    const messengerName = cleanStr(getCell(row, idx.usuarioUltimoEstatus)) || null;
    const messengerEmail = cleanStr(getCell(row, idx.emailUsuario)) || null;
    const attemptsRaw = cleanStr(getCell(row, idx.intentos));
    const attemptsCount = Number(attemptsRaw) || 0;
    const lastAttemptNotes = cleanStr(getCell(row, idx.notasUltimoIntento)) || null;

    parsed.push({
      requestNumber,
      trackingNumber,
      customerName,
      customerPhone,
      customerAddress,
      rawStatus,
      mappedStatus,
      deliveryDate,
      recipientName,
      messengerName,
      messengerEmail,
      attemptsCount,
      lastAttemptNotes,
      sourceRowNumber: i + 1,
    });
  }

  return { rows: parsed, errors, headerRowIndex };
}
