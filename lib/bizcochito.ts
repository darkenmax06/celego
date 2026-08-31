import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { CardStatus, Prisma } from "@prisma/client";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { resolveDeliveryLocation } from "@/lib/delivery-location";
import { writeAuditEvent } from "@/lib/audit";
import { DIGITAL_DELIVERY_STATUSES } from "@/lib/card-transition";

// SDD contrato-tarjetas-pistoleo (spec: bizcochito-report). A card entering
// `ENTREGA_DIGITAL_SIN_CONTRATO` counts for the digital cycle immediately, so
// every bizcochito query site widens from a single `ENTREGA_DIGITAL` check to
// membership in `DIGITAL_DELIVERY_STATUSES`.
const DIGITAL_DELIVERY_STATUS_LIST = Array.from(DIGITAL_DELIVERY_STATUSES);

export const bizcochitoCardInclude = {
  customer: true,
  currentMessenger: true,
  reassignedMessenger: true,
  logs: {
    where: { toStatus: { in: DIGITAL_DELIVERY_STATUS_LIST } },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
  routeItems: {
    include: {
      route: {
        include: {
          messenger: true,
        },
      },
    },
  },
} satisfies Prisma.CardInclude;

export type BizcochitoCard = Prisma.CardGetPayload<{
  include: typeof bizcochitoCardInclude;
}>;

export type BizcochitoSnapshot = {
  codigoBizcochito: string;
  cicloDigital: number;
  tc: string;
  referenciaExterna: string;
  cliente: string;
  cedula: string;
  telefonos: string;
  direccion: string;
  status: string;
  fechaDespacho: string;
  fechaEntregaDigital: string;
  provinciaOriginal: string;
  zonaOriginal: string;
  provinciaEfectiva: string;
  zonaEfectiva: string;
  mensajeroOriginalActual: string;
  mensajeroReasignado: string;
  zonaRemota: string;
  tipoTarjeta: string;
  adicional: string;
  adicionalNumero: number;
  tipoEmision: string;
  tipoEntrega: string;
  suplidor: string;
  tipoContrato: string;
  tieneContrato: string;
  imagenContratoSubida: string;
};

function isoDate(value: Date | null | undefined) {
  return value ? format(value, "yyyy-MM-dd HH:mm:ss") : "";
}

function metadataString(metadata: Prisma.JsonValue | null, key: string) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return "";
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function latestRouteMessenger(card: BizcochitoCard) {
  return [...card.routeItems]
    .sort((left, right) => right.route.createdAt.getTime() - left.route.createdAt.getTime())
    .at(0)?.route.messenger.nombre;
}

export function createBizcochitoSnapshot(
  card: BizcochitoCard,
  code: string,
  cycle = card.digitalDeliveryCycle,
): BizcochitoSnapshot {
  const effectiveLocation = resolveDeliveryLocation(card);
  return {
    codigoBizcochito: code,
    cicloDigital: cycle,
    tc: card.tc,
    referenciaExterna: card.externalReference ?? "",
    cliente: card.customer.nombre,
    cedula: card.customer.cedula,
    telefonos: card.customer.telefonosRaw ?? "",
    direccion: card.customer.direccionRaw ?? "",
    status: card.status,
    fechaDespacho: isoDate(card.dispatchDate),
    fechaEntregaDigital: isoDate(card.logs[0]?.createdAt),
    provinciaOriginal: card.provincia,
    zonaOriginal: card.zona,
    provinciaEfectiva: effectiveLocation.province,
    zonaEfectiva: effectiveLocation.zone,
    mensajeroOriginalActual:
      card.currentMessenger?.nombre ?? latestRouteMessenger(card) ?? "",
    mensajeroReasignado: card.reassignedMessenger?.nombre ?? "",
    zonaRemota: card.isRemote ? "SI" : "NO",
    tipoTarjeta: card.isAdditional ? "ADICIONAL" : "PRINCIPAL",
    adicional: card.isAdditional ? "SI" : "NO",
    adicionalNumero: card.additionalIndex,
    tipoEmision: card.emissionType ?? "",
    tipoEntrega: card.deliveryType ?? metadataString(card.metadata, "tipoEntrega"),
    suplidor: card.supplier ?? "",
    tipoContrato: card.contractType ?? "",
    // SDD contrato-tarjetas-pistoleo: read from `hasContract`/`contractImageAt`
    // directly, NOT from current status — a resolved card may have already
    // moved past ENTREGA_DIGITAL_SIN_CONTRATO to ENTREGA_DIGITAL.
    tieneContrato: card.hasContract ? "SI" : "NO",
    imagenContratoSubida: card.hasContract ? (card.contractImageAt ? "SI" : "NO") : "",
  };
}

const excelColumns: Array<{
  header: string;
  key: keyof BizcochitoSnapshot;
  width: number;
}> = [
  { header: "Código de Bizcochito", key: "codigoBizcochito", width: 24 },
  { header: "Ciclo digital", key: "cicloDigital", width: 14 },
  { header: "TC", key: "tc", width: 22 },
  { header: "Referencia externa", key: "referenciaExterna", width: 20 },
  { header: "Cliente", key: "cliente", width: 28 },
  { header: "Cédula", key: "cedula", width: 18 },
  { header: "Teléfonos", key: "telefonos", width: 22 },
  { header: "Dirección", key: "direccion", width: 42 },
  { header: "Status", key: "status", width: 20 },
  { header: "Fecha de despacho", key: "fechaDespacho", width: 22 },
  { header: "Fecha de entrega digital", key: "fechaEntregaDigital", width: 24 },
  { header: "Provincia original", key: "provinciaOriginal", width: 20 },
  { header: "Zona original", key: "zonaOriginal", width: 16 },
  { header: "Provincia efectiva", key: "provinciaEfectiva", width: 20 },
  { header: "Zona efectiva / facturable", key: "zonaEfectiva", width: 24 },
  { header: "Mensajero original / actual", key: "mensajeroOriginalActual", width: 28 },
  { header: "Mensajero reasignado", key: "mensajeroReasignado", width: 24 },
  { header: "Zona remota", key: "zonaRemota", width: 14 },
  { header: "Tipo tarjeta", key: "tipoTarjeta", width: 16 },
  { header: "Adicional", key: "adicional", width: 12 },
  { header: "No adicional", key: "adicionalNumero", width: 14 },
  { header: "Tipo de emisión", key: "tipoEmision", width: 18 },
  { header: "Tipo de entrega", key: "tipoEntrega", width: 18 },
  { header: "Suplidor", key: "suplidor", width: 20 },
  { header: "Tipo de contrato", key: "tipoContrato", width: 20 },
  { header: "Tiene contrato", key: "tieneContrato", width: 16 },
  { header: "Se subió imagen del contrato", key: "imagenContratoSubida", width: 26 },
];

export async function buildBizcochitoExcel(rows: BizcochitoSnapshot[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Celego";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Bizcochito", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });

  sheet.columns = excelColumns;
  sheet.addRows(rows);
  sheet.autoFilter = {
    from: "A1",
    to: `${sheet.getColumn(excelColumns.length).letter}${Math.max(1, rows.length + 1)}`,
  };

  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F2544" },
  };
  header.alignment = { vertical: "middle", horizontal: "center" };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function batchCode(date: Date, sequence: number) {
  const dateTag = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll("-", "");
  return `BIZ-${dateTag}-${String(sequence).padStart(4, "0")}`;
}

export async function generateBizcochito(userId: string, request?: Request) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const cards = await tx.card.findMany({
            where: {
              status: { in: DIGITAL_DELIVERY_STATUS_LIST },
              bizcochito: false,
              digitalDeliveryCycle: { gt: 0 },
            },
            include: bizcochitoCardInclude,
            orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          });

          if (!cards.length) return null;

          const generatedAt = new Date();
          const pendingCode = `PENDING-${randomUUID()}`;
          const provisional = await tx.bizcochitoBatch.create({
            data: {
              code: pendingCode,
              generatedById: userId,
              generatedAt,
              itemCount: cards.length,
              originalFileName: `${pendingCode}.xlsx`,
              originalFile: Buffer.alloc(0),
              originalSha256: "",
            },
          });
          const code = batchCode(generatedAt, provisional.sequence);
          const snapshots = cards.map((card) => createBizcochitoSnapshot(card, code));
          const file = await buildBizcochitoExcel(snapshots);
          const fileName = `${code}.xlsx`;
          const sha256 = createHash("sha256").update(file).digest("hex");

          await tx.bizcochitoItem.createMany({
            data: cards.map((card, index) => ({
              batchId: provisional.id,
              cardId: card.id,
              digitalDeliveryCycle: card.digitalDeliveryCycle,
              sequence: index + 1,
              snapshot: snapshots[index] as unknown as Prisma.InputJsonValue,
            })),
          });

          for (const card of cards) {
            const claimed = await tx.card.updateMany({
              where: {
                id: card.id,
                // Claims the exact status this card was read with (ENTREGA_DIGITAL
                // or ENTREGA_DIGITAL_SIN_CONTRATO), not a fixed literal, so a
                // concurrent status change is still detected correctly.
                status: card.status,
                digitalDeliveryCycle: card.digitalDeliveryCycle,
                bizcochito: false,
              },
              data: {
                bizcochito: true,
                bizcochitoAt: generatedAt,
              },
            });
            if (claimed.count !== 1) {
              throw new Error("BIZCOCHITO_CONFLICT");
            }
          }

          const batch = await tx.bizcochitoBatch.update({
            where: { id: provisional.id },
            data: {
              code,
              originalFileName: fileName,
              originalFile: file,
              originalSha256: sha256,
            },
          });

          await writeAuditEvent(
            {
              entity: "BIZCOCHITO",
              entityId: batch.id,
              action: "GENERATE",
              userId,
              details: {
                code,
                itemCount: cards.length,
                sha256,
              },
              request,
            },
            tx,
          );

          return { batch, file };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryable =
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002")) ||
        (error instanceof Error && error.message === "BIZCOCHITO_CONFLICT");
      if (!retryable || attempt === maxAttempts) throw error;
    }
  }

  return null;
}
