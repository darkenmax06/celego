import { CardStatus, CardProductType, DispatchOrigin } from "@prisma/client";
import { readWorkbook, getSheetRows, findHeaderRow, mapHeaderIndex, getCell } from "@/lib/importers/workbook";
import { parseExcelSerialDate } from "@/lib/date";
import { resolveZone } from "@/lib/zone-map";

export type ParsedDebitDespachoRow = {
  requestNumber: string;
  tc: string;
  cedula: string;
  nombre: string;
  provincia: string;
  zona: string;
  direccionRaw: string;
  telefonosRaw: string;
  status: CardStatus;
  dispatchDate: Date;
  isRemote: boolean;
  productType: CardProductType;
  dispatchOrigin: DispatchOrigin;
  officeName: string | null;
  analyst: string | null;
  sector: string;
  calle: string;
  numero: string;
  empresa: string;
  depto: string;
  referencia: string;
  tel1: string;
  tel2: string;
  tel3: string;
  rawRecord: Record<string, unknown>;
  sourceRowNumber: number;
};

export type DebitDespachoImportResult = {
  rows: ParsedDebitDespachoRow[];
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

export function parseDebitDespachoImport(buffer: Buffer): DebitDespachoImportResult {
  const workbook = readWorkbook(buffer);
  const sheetName = workbook.SheetNames.includes("CELE") ? "CELE" : workbook.SheetNames[0];
  const rows = getSheetRows(workbook, sheetName);

  const requiredHeaderAliases = [
    ["NRO_SS", "N-SS", "NRO SS", "SOLICITUD", "NO_ORDEN", "NO. DE ORDEN"],
    ["NRO_ID", "CEDULA", "NRO ID"],
    ["CONTACTO", "NOMBRE", "CLIENTE"],
  ];

  const headerRowIndex = findHeaderRow(rows, requiredHeaderAliases, 40);
  if (headerRowIndex < 0) {
    throw new Error("No se pudo detectar el encabezado del archivo de Despacho de Débito (hoja CELE)");
  }

  const header = rows[headerRowIndex];
  const idx = {
    nss: mapHeaderIndex(header, ["NRO_SS", "N-SS", "NRO SS", "SOLICITUD", "NO_ORDEN"]),
    tipo: mapHeaderIndex(header, ["TIPO"]),
    area: mapHeaderIndex(header, ["AREA"]),
    subarea: mapHeaderIndex(header, ["SUBAREA"]),
    analista: mapHeaderIndex(header, ["ANALISTA_ASIGNADO", "ANALISTA"]),
    nroId: mapHeaderIndex(header, ["NRO_ID", "CEDULA", "NRO ID"]),
    contacto: mapHeaderIndex(header, ["CONTACTO", "NOMBRE", "CLIENTE"]),
    oficina: mapHeaderIndex(header, ["NOMBRE_DE_OFICINA", "OFICINA", "SUCURSAL"]),
    oficial: mapHeaderIndex(header, ["OFICIAL"]),
    provmunsec: mapHeaderIndex(header, ["PROVMUNSEC"]),
    descripcionAmpliada: mapHeaderIndex(header, ["DESCRIPCION_AMPLIADA", "DIRECCION"]),
    provincia: mapHeaderIndex(header, ["PROVINCIA"]),
    municipio: mapHeaderIndex(header, ["MUNICIPIO", "DISTRITO_MUNICIPIAL"]),
    distrito: mapHeaderIndex(header, ["DISTRITO_MUNICIPIAL"]),
    sector: mapHeaderIndex(header, ["SECTOR"]),
    calle: mapHeaderIndex(header, ["CALLE"]),
    numero: mapHeaderIndex(header, ["NUMERO", "NO"]),
    empresa: mapHeaderIndex(header, ["EMPRESA_EDIFICIO", "EMPRESA"]),
    depto: mapHeaderIndex(header, ["DEPTO_APTO", "DEPTO", "APTO"]),
    referencia: mapHeaderIndex(header, ["REFERENCIA"]),
    tel1: mapHeaderIndex(header, ["TEL_1", "TEL1", "TELEFONO 1"]),
    tel2: mapHeaderIndex(header, ["TEL_2", "TEL2", "TELEFONO 2"]),
    tel3: mapHeaderIndex(header, ["TEL_3", "TEL3", "TELEFONO 3"]),
    creadoPor: mapHeaderIndex(header, ["CREADO_POR"]),
    fechaCreacion: mapHeaderIndex(header, ["FECHA_CREACION", "FECHA CREACION", "FECHA"]),
    estado: mapHeaderIndex(header, ["ESTADO"]),
    nota: mapHeaderIndex(header, ["NOTA"]),
  };

  const parsed: ParsedDebitDespachoRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const rawNss = getCell(row, idx.nss);
    const rawCedula = getCell(row, idx.nroId);
    const rawNombre = getCell(row, idx.contacto);

    if (!rawNss && !rawCedula && !rawNombre) continue;

    if (!rawNss) {
      errors.push({ row: i + 1, message: "Fila sin NRO_SS (solicitud de débito)" });
      continue;
    }

    const nss = cleanStr(rawNss);
    const cedula = onlyDigits(cleanStr(rawCedula));
    const nombre = cleanStr(rawNombre) || "SIN NOMBRE";
    const rawProv = cleanStr(getCell(row, idx.provincia));
    const provincia = rawProv || "Santo Domingo";
    const zona = resolveZone(provincia, "Metro");

    const sector = cleanStr(getCell(row, idx.sector));
    const calle = cleanStr(getCell(row, idx.calle));
    const numero = cleanStr(getCell(row, idx.numero));
    const empresa = cleanStr(getCell(row, idx.empresa));
    const depto = cleanStr(getCell(row, idx.depto));
    const referencia = cleanStr(getCell(row, idx.referencia));
    const descAmpliada = cleanStr(getCell(row, idx.descripcionAmpliada));

    const addressParts = [calle, numero ? `No. ${numero}` : "", sector, empresa, depto, referencia ? `Ref: ${referencia}` : ""].filter(Boolean);
    const direccionRaw = addressParts.length ? addressParts.join(", ") : descAmpliada || provincia;

    const tel1 = cleanStr(getCell(row, idx.tel1));
    const tel2 = cleanStr(getCell(row, idx.tel2));
    const tel3 = cleanStr(getCell(row, idx.tel3));

    const phones = [tel1, tel2, tel3]
      .map(onlyDigits)
      .filter((p) => p.length >= 7 && !/^0+$/.test(p) && p !== "0000000001");
    const telefonosRaw = [...new Set(phones)].join(" | ");

    const rawFecha = getCell(row, idx.fechaCreacion);
    const dispatchDate = parseExcelSerialDate(rawFecha) ?? new Date();

    const rawRecord: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c += 1) {
      const h = cleanStr(header[c]);
      if (h) rawRecord[h] = row[c] ?? null;
    }

    parsed.push({
      requestNumber: nss,
      tc: nss,
      cedula: cedula || "00000000000",
      nombre,
      provincia,
      zona,
      direccionRaw,
      telefonosRaw,
      status: CardStatus.DESPACHADA,
      dispatchDate,
      isRemote: false,
      productType: CardProductType.DEBITO,
      dispatchOrigin: DispatchOrigin.BPD_DEBITO,
      officeName: cleanStr(getCell(row, idx.oficina)) || null,
      analyst: cleanStr(getCell(row, idx.analista)) || null,
      sector,
      calle,
      numero,
      empresa,
      depto,
      referencia,
      tel1,
      tel2,
      tel3,
      rawRecord,
      sourceRowNumber: i + 1,
    });
  }

  return { rows: parsed, errors, headerRowIndex };
}
