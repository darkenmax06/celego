import { CardStatus, CardProductType, DispatchOrigin } from "@prisma/client";
import { readWorkbook, getSheetRows, findHeaderRow, mapHeaderIndex, getCell } from "@/lib/importers/workbook";
import { parseExcelSerialDate } from "@/lib/date";
import { resolveZone } from "@/lib/zone-map";
import { normalizeDebitConsolidadoStatus } from "@/lib/debit-status";

export type ParsedDebitConsolidadoRow = {
  requestNumber: string;
  tc: string;
  cedula: string;
  nombre: string;
  provincia: string;
  zona: string;
  direccionRaw: string;
  telefonosRaw: string;
  status: CardStatus;
  rawStatus: string;
  dispatchDate: Date | null;
  deliveryDate: Date | null;
  isRemote: boolean;
  productType: CardProductType;
  dispatchOrigin: DispatchOrigin;
  comment: string | null;
  recipientName: string | null;
  thirdPartyInfo: string | null;
  bpdComment: string | null;
  callCenterStatus: string | null;
  callCenterContact: string | null;
  officeName: string | null;
  analyst: string | null;
  rawRecord: Record<string, unknown>;
  sourceRowNumber: number;
};

export type DebitConsolidadoImportResult = {
  rows: ParsedDebitConsolidadoRow[];
  errors: Array<{ row: number; message: string }>;
  headerRowIndex: number;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function cleanStr(val: unknown): string {
  if (val == null) return "";
  return String(val).trim();
}

export function parseDebitConsolidadoImport(buffer: Buffer, preferredSheet = "DATA"): DebitConsolidadoImportResult {
  const workbook = readWorkbook(buffer);
  const sheetName = workbook.SheetNames.includes(preferredSheet) ? preferredSheet : workbook.SheetNames[0];
  const rows = getSheetRows(workbook, sheetName);

  const requiredHeaderAliases = [
    ["N-SS", "NRO_SS", "NRO SS", "NO_ORDEN", "NO. DE ORDEN", "ORDEN"],
    ["NRO_ID", "CEDULA", "NRO ID", "IDENTIFICACION"],
    ["CONTACTO", "NOMBRE", "CLIENTE", "NOMBRES"],
  ];

  const headerRowIndex = findHeaderRow(rows, requiredHeaderAliases, 40);
  if (headerRowIndex < 0) {
    throw new Error("No se pudo detectar el encabezado del Consolidado de Débito (hoja DATA)");
  }

  const header = rows[headerRowIndex];
  const idx = {
    fechaAsig: mapHeaderIndex(header, ["FECH ASIG", "FECHA ASIGNACION", "FECHA ASIG", "FECHA_ASIGNACION"]),
    nss: mapHeaderIndex(header, ["N-SS", "NRO_SS", "NRO SS", "NO_ORDEN", "NO. DE ORDEN", "ORDEN"]),
    tipo: mapHeaderIndex(header, ["TIPO"]),
    area: mapHeaderIndex(header, ["AREA"]),
    subarea: mapHeaderIndex(header, ["SUBAREA"]),
    analista: mapHeaderIndex(header, ["ANALISTA_ASIGNADO", "ANALISTA"]),
    nroId: mapHeaderIndex(header, ["NRO_ID", "CEDULA", "NRO ID", "IDENTIFICACION"]),
    contacto: mapHeaderIndex(header, ["CONTACTO", "NOMBRE", "CLIENTE", "NOMBRES"]),
    oficina: mapHeaderIndex(header, ["NOMBRE_DE_OFICINA", "OFICINA", "SUCURSAL"]),
    oficial: mapHeaderIndex(header, ["OFICIAL"]),
    provmunsec: mapHeaderIndex(header, ["PROVMUNSEC", "PMS"]),
    descripcionAmpliada: mapHeaderIndex(header, ["DESCRIPCION_AMPLIADA", "DIRECCION COMPLETA", "DIRECCION"]),
    provincia: mapHeaderIndex(header, ["PROVINCIA"]),
    estado: mapHeaderIndex(header, ["ESTADO", "ESTADO_PROV"]),
    municipio: mapHeaderIndex(header, ["MUNICIPIO", "DISTRITO_MUNICIPIAL"]),
    distrito: mapHeaderIndex(header, ["DISTRITO_MUNICIPIAL"]),
    sector: mapHeaderIndex(header, ["SECTOR"]),
    calle: mapHeaderIndex(header, ["CALLE"]),
    numero: mapHeaderIndex(header, ["NUMERO", "NO"]),
    empresa: mapHeaderIndex(header, ["EMPRESA_EDIFICIO", "EMPRESA", "EDIFICIO"]),
    depto: mapHeaderIndex(header, ["DEPTO_APTO", "DEPTO", "APTO"]),
    referencia: mapHeaderIndex(header, ["REFERENCIA"]),
    tipoTel1: mapHeaderIndex(header, ["TIPO_TEL_1"]),
    tel1: mapHeaderIndex(header, ["TEL_1", "TELEFONO 1", "TEL1"]),
    extTel1: mapHeaderIndex(header, ["EXT_TEL_1"]),
    tipoTel2: mapHeaderIndex(header, ["TIPO_TEL_2"]),
    tel2: mapHeaderIndex(header, ["TEL_2", "TELEFONO 2", "TEL2"]),
    extTel2: mapHeaderIndex(header, ["EXT_TEL_2"]),
    tipoTel3: mapHeaderIndex(header, ["TIPO_TEL_3"]),
    tel3: mapHeaderIndex(header, ["TEL_3", "TELEFONO 3", "TEL3"]),
    extTel3: mapHeaderIndex(header, ["EXT_TEL_3"]),
    creadoPor: mapHeaderIndex(header, ["CREADO_POR"]),
    fechaCreacion: mapHeaderIndex(header, ["FECHA_CREACION", "FECHA CREACION"]),
    zona: mapHeaderIndex(header, ["ZONA"]),
    status: mapHeaderIndex(header, ["STATUS", "ESTATUS"]),
    comentario: mapHeaderIndex(header, ["COMENTARIO"]),
    quienRecibe: mapHeaderIndex(header, ["QUIEN RECIBE", "RECIBE"]),
    infoTercero: mapHeaderIndex(header, ["INFO TERCERO"]),
    fechaEntrega: mapHeaderIndex(header, ["FECHA DE ENTREGA", "FECHA DE ENTREGA2", "FECHA_ENTREGA"]),
    comentarioBpd: mapHeaderIndex(header, ["COMENTARIO BPD", "COMENTARIO_BPD"]),
    areasRemotas: mapHeaderIndex(header, ["AREAS REMOTAS", "REMOTA", "ZONA REMOTA"]),
    statusCc: mapHeaderIndex(header, ["STATUS CC", "STATUS_CC"]),
    contactoCc: mapHeaderIndex(header, ["CONTACTO CC", "CONTACTO_CC"]),
    noContact: mapHeaderIndex(header, ["NO. CONTACT", "NO_CONTACT"]),
  };

  const parsed: ParsedDebitConsolidadoRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const rawNss = getCell(row, idx.nss);
    const rawCedula = getCell(row, idx.nroId);
    const rawNombre = getCell(row, idx.contacto);

    if (!rawNss && !rawCedula && !rawNombre) continue;

    if (!rawNss) {
      errors.push({ row: i + 1, message: "Fila sin N-SS (solicitud de débito)" });
      continue;
    }

    const nss = cleanStr(rawNss);
    const cedula = onlyDigits(cleanStr(rawCedula));
    const nombre = cleanStr(rawNombre) || "SIN NOMBRE";
    const rawProv = cleanStr(getCell(row, idx.provincia));
    const provincia = rawProv || "Santo Domingo";
    const zona = resolveZone(provincia, "Metro");

    // Address combination
    const sector = cleanStr(getCell(row, idx.sector));
    const calle = cleanStr(getCell(row, idx.calle));
    const numero = cleanStr(getCell(row, idx.numero));
    const empresa = cleanStr(getCell(row, idx.empresa));
    const depto = cleanStr(getCell(row, idx.depto));
    const ref = cleanStr(getCell(row, idx.referencia));
    const descAmpliada = cleanStr(getCell(row, idx.descripcionAmpliada));

    const addressParts = [calle, numero ? `No. ${numero}` : "", sector, empresa, depto, ref ? `Ref: ${ref}` : ""].filter(Boolean);
    const direccionRaw = addressParts.length ? addressParts.join(", ") : descAmpliada || provincia;

    // Phones
    const phones = [
      cleanStr(getCell(row, idx.tel1)),
      cleanStr(getCell(row, idx.tel2)),
      cleanStr(getCell(row, idx.tel3)),
      cleanStr(getCell(row, idx.noContact)),
    ]
      .map(onlyDigits)
      .filter((p) => p.length >= 7 && !/^0+$/.test(p) && p !== "0000000001");
    const telefonosRaw = [...new Set(phones)].join(" | ");

    // Status
    const rawStatus = cleanStr(getCell(row, idx.status));
    const status = normalizeDebitConsolidadoStatus(rawStatus);

    // Dates
    const rawFechaAsig = getCell(row, idx.fechaAsig) || getCell(row, idx.fechaCreacion);
    const dispatchDate = parseExcelSerialDate(rawFechaAsig);
    const rawFechaEntrega = getCell(row, idx.fechaEntrega);
    const deliveryDate = parseExcelSerialDate(rawFechaEntrega);

    // Remote flag
    const rawRemote = cleanStr(getCell(row, idx.areasRemotas)).toUpperCase();
    const isRemote = rawRemote === "SI" || rawRemote === "S" || rawRemote === "TRUE" || rawRemote === "1" || rawRemote === "X";

    // Raw record dictionary for reconstruction
    const rawRecord: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c += 1) {
      const h = cleanStr(header[c]);
      if (h) rawRecord[h] = row[c] ?? null;
    }

    parsed.push({
      requestNumber: nss,
      tc: nss, // Using requestNumber as TC for consistency across system
      cedula: cedula || "00000000000",
      nombre,
      provincia,
      zona,
      direccionRaw,
      telefonosRaw,
      status,
      rawStatus,
      dispatchDate,
      deliveryDate,
      isRemote,
      productType: CardProductType.DEBITO,
      dispatchOrigin: DispatchOrigin.BPD_DEBITO,
      comment: cleanStr(getCell(row, idx.comentario)) || null,
      recipientName: cleanStr(getCell(row, idx.quienRecibe)) || null,
      thirdPartyInfo: cleanStr(getCell(row, idx.infoTercero)) || null,
      bpdComment: cleanStr(getCell(row, idx.comentarioBpd)) || null,
      callCenterStatus: cleanStr(getCell(row, idx.statusCc)) || null,
      callCenterContact: cleanStr(getCell(row, idx.contactoCc)) || null,
      officeName: cleanStr(getCell(row, idx.oficina)) || null,
      analyst: cleanStr(getCell(row, idx.analista)) || null,
      rawRecord,
      sourceRowNumber: i + 1,
    });
  }

  return { rows: parsed, errors, headerRowIndex };
}
