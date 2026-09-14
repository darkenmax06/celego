import { z } from "zod";
import { formatCardDate, type CardDateSource } from "@/lib/card-date-fields";

/**
 * Whitelisted fields for exporting a card selection. The order here is the
 * column order of the generated file, regardless of the order requested.
 */
export const CARD_EXPORT_FIELDS = [
  { key: "tc", label: "TC" },
  { key: "requestNumber", label: "No. solicitud" },
  { key: "externalReference", label: "Referencia" },
  { key: "productType", label: "Producto" },
  { key: "nombre", label: "Cliente" },
  { key: "cedula", label: "Cédula" },
  { key: "telefonos", label: "Teléfonos" },
  { key: "direccion", label: "Dirección" },
  { key: "status", label: "Estado" },
  { key: "provincia", label: "Provincia" },
  { key: "zona", label: "Zona" },
  { key: "remota", label: "Remota" },
  { key: "tipo", label: "Tipo" },
  { key: "origen", label: "Origen" },
  { key: "urgente", label: "Urgente" },
  { key: "mensajero", label: "Mensajero" },
  { key: "motivoRetorno", label: "Motivo de devolución" },
  { key: "dispatchDate", label: "Fecha de despacho" },
  { key: "slaDueDate", label: "Vencimiento SLA" },
  { key: "fechaPreferenciaEntrega", label: "Preferencia de entrega" },
  { key: "reassignedAt", label: "Fecha de reasignación" },
  { key: "bizcochitoAt", label: "Fecha bizcochito" },
  { key: "contractImageAt", label: "Fecha imagen contrato" },
  { key: "createdAt", label: "Fecha de creación" },
  { key: "updatedAt", label: "Última actualización" },
] as const;

export type CardExportFieldKey = (typeof CARD_EXPORT_FIELDS)[number]["key"];

export const DEFAULT_CARD_EXPORT_FIELDS: CardExportFieldKey[] = [
  "tc",
  "nombre",
  "cedula",
  "status",
  "provincia",
  "zona",
  "mensajero",
  "dispatchDate",
  "slaDueDate",
];

export const MAX_CARD_EXPORT_SELECTION = 5000;

const fieldKeys = CARD_EXPORT_FIELDS.map((field) => field.key) as [
  CardExportFieldKey,
  ...CardExportFieldKey[],
];

export const cardSelectionExportSchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(MAX_CARD_EXPORT_SELECTION),
  fields: z.array(z.enum(fieldKeys)).min(1),
  format: z.enum(["xlsx", "csv"]),
});

export type CardSelectionExportRequest = z.infer<typeof cardSelectionExportSchema>;

export type ExportableCard = CardDateSource & {
  tc: string;
  requestNumber: string | null;
  externalReference: string | null;
  productType: string | null;
  status: string;
  provincia: string;
  zona: string;
  isRemote: boolean;
  isAdditional: boolean;
  additionalIndex: number;
  urgent: boolean;
  dispatchOrigin: string | null;
  returnReason: string | null;
  customer: { nombre: string; cedula: string; telefonosRaw: string | null; direccionRaw: string | null };
  currentMessenger: { nombre: string } | null;
};

const ORIGIN_LABELS: Record<string, string> = {
  TORRE_POPULAR: "Torre Popular",
  CENTRO_ACOPIO: "Centro de acopio",
  BPD_DEBITO: "BPD Débito",
};

function cellValue(card: ExportableCard, key: CardExportFieldKey): string {
  switch (key) {
    case "tc":
      return card.tc;
    case "requestNumber":
      return card.requestNumber ?? "";
    case "externalReference":
      return card.externalReference ?? "";
    case "productType":
      return card.productType === "DEBITO" ? "Débito" : "Crédito";
    case "nombre":
      return card.customer.nombre;
    case "cedula":
      return card.customer.cedula;
    case "telefonos":
      return card.customer.telefonosRaw ?? "";
    case "direccion":
      return card.customer.direccionRaw ?? "";
    case "status":
      return card.status;
    case "provincia":
      return card.provincia;
    case "zona":
      return card.zona;
    case "remota":
      return card.isRemote ? "SI" : "NO";
    case "tipo":
      return card.isAdditional ? `ADICIONAL ${card.additionalIndex}` : "PRINCIPAL";
    case "origen":
      return card.dispatchOrigin ? ORIGIN_LABELS[card.dispatchOrigin] ?? card.dispatchOrigin : "Sin procedencia";
    case "urgente":
      return card.urgent ? "SI" : "NO";
    case "mensajero":
      return card.currentMessenger?.nombre ?? "";
    case "motivoRetorno":
      return card.returnReason ?? "";
    default:
      return formatCardDate(card, key, "");
  }
}

/**
 * Maps cards to export rows keyed by the Spanish column label. Requested
 * fields are de-duplicated and emitted in `CARD_EXPORT_FIELDS` order.
 */
export function buildCardExportRows(cards: ExportableCard[], fields: readonly CardExportFieldKey[]) {
  const requested = new Set(fields);
  const columns = CARD_EXPORT_FIELDS.filter((field) => requested.has(field.key));
  return cards.map((card) => {
    const row: Record<string, string> = {};
    for (const column of columns) row[column.label] = cellValue(card, column.key);
    return row;
  });
}
