import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

type GenericDelegate = {
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  count: (args: unknown) => Promise<number>;
};

export type ProvinceReference = {
  label: string;
  model: "card" | "customer" | "messenger" | "cardDeliveryReassignment" | "urgentCase" | "sLAExtensionRequest" | "lot";
  column: string;
  nullable: boolean;
  /** Zone column on the same row that follows the province when it is rewritten. */
  zoneColumn?: string;
  zoneNullable?: boolean;
};

/**
 * Scalar columns that store a province name. JSON columns (Card.metadata,
 * ContactLog.snapshot, AuditLog.details, ...) are historical and are neither
 * checked nor rewritten.
 */
export const PROVINCE_REFERENCES: ProvinceReference[] = [
  { label: "Card.provincia", model: "card", column: "provincia", nullable: false, zoneColumn: "zona" },
  { label: "Card.reassignedProvince", model: "card", column: "reassignedProvince", nullable: true },
  { label: "Customer.provincia", model: "customer", column: "provincia", nullable: true, zoneColumn: "zona", zoneNullable: true },
  { label: "Messenger.provinciaTrabajo", model: "messenger", column: "provinciaTrabajo", nullable: true },
  { label: "CardDeliveryReassignment.fromProvince", model: "cardDeliveryReassignment", column: "fromProvince", nullable: false },
  { label: "CardDeliveryReassignment.toProvince", model: "cardDeliveryReassignment", column: "toProvince", nullable: false },
  { label: "UrgentCase.provincia", model: "urgentCase", column: "provincia", nullable: true },
  { label: "SLAExtensionRequest.provinciaOrigen", model: "sLAExtensionRequest", column: "provinciaOrigen", nullable: false },
  { label: "SLAExtensionRequest.provinciaDestino", model: "sLAExtensionRequest", column: "provinciaDestino", nullable: true },
  { label: "Lot.sentTo", model: "lot", column: "sentTo", nullable: true },
];

function zoneDiffers(reference: ProvinceReference, zona: string) {
  const column = reference.zoneColumn!;
  return reference.zoneNullable
    ? { OR: [{ [column]: null }, { NOT: { [column]: zona } }] }
    : { NOT: { [column]: zona } };
}

function delegate(db: Db, reference: ProvinceReference) {
  return (db as unknown as Record<string, GenericDelegate>)[reference.model];
}

/** Distinct stored values of one reference column. */
export async function findReferenceValues(db: Db, reference: ProvinceReference) {
  const rows = await delegate(db, reference).findMany({
    ...(reference.nullable ? { where: { [reference.column]: { not: null } } } : {}),
    distinct: [reference.column],
    select: { [reference.column]: true },
  });
  return rows.map((row) => row[reference.column]).filter((value): value is string => typeof value === "string");
}

/** Rows holding any of the exact stored `values`. */
export async function countReferenceRows(db: Db, reference: ProvinceReference, values: string[]) {
  if (!values.length) return 0;
  return delegate(db, reference).count({ where: { [reference.column]: { in: values } } });
}

/** Rows whose zone would change when `from` values are rewritten to a province in `zona`. */
export async function countZoneChanges(db: Db, reference: ProvinceReference, from: string[], zona: string) {
  if (!reference.zoneColumn || !from.length) return 0;
  return delegate(db, reference).count({
    where: { [reference.column]: { in: from }, ...zoneDiffers(reference, zona) },
  });
}

/**
 * Rewrites the exact stored values `from` to `to.nombre`; rows with a zone
 * column also take `to.zona`. Returns the rewritten row count and how many of
 * those rows changed zone.
 */
export async function rewriteReferenceValues(
  db: Db,
  reference: ProvinceReference,
  from: string[],
  to: { nombre: string; zona: string },
) {
  const values = from.filter((value) => value !== to.nombre);
  if (!values.length) return { rows: 0, zoneRows: 0 };
  const model = delegate(db, reference);
  let zoneRows = 0;
  if (reference.zoneColumn) {
    const zoneUpdate = await model.updateMany({
      where: { [reference.column]: { in: values }, ...zoneDiffers(reference, to.zona) },
      data: { [reference.column]: to.nombre, [reference.zoneColumn]: to.zona },
    });
    zoneRows = zoneUpdate.count;
  }
  const rest = await model.updateMany({
    where: { [reference.column]: { in: values } },
    data: { [reference.column]: to.nombre },
  });
  return { rows: rest.count + zoneRows, zoneRows };
}
