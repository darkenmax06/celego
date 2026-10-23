import {
  CONTACT_RESULTADO_LABELS,
  type ContactResultado,
  type PhoneCallDetail,
} from "@/lib/contact-call";
import { formatCanalContacto, formatTemplateDate, formatTipoTarjeta } from "@/lib/contact-template";

export const NO_DELIVERY_DATE_TEXT = "Sin fecha específica";

export type ContactReportSource = {
  createdAt: Date;
  operador: string | null;
  tc: string;
  cliente: string;
  cedula: string;
  productType: string | null;
  provincia: string;
  zona: string;
  cardDireccion: string | null;
  nuevaDireccion: string | null;
  telefonosDetalle: PhoneCallDetail[] | null;
  telefonosUsados: string | null;
  telefonoPrincipal: string | null;
  canalContacto: string | null;
  fechaPreferenciaEntrega: Date | string | null;
  mensajero: string | null;
  mensajeroTelefono: string | null;
  resultado: string | null;
  comentario: string | null;
};

/** Address collected in the call, falling back to the card's registered address. */
export function resolveReportAddress(source: Pick<ContactReportSource, "nuevaDireccion" | "cardDireccion">) {
  return source.nuevaDireccion?.trim() || source.cardDireccion?.trim() || "";
}

/**
 * Contact phone: first phone marked CONTESTA, else the first phone used in
 * the call, else the card's principal phone.
 */
export function resolveReportPhone(
  source: Pick<ContactReportSource, "telefonosDetalle" | "telefonosUsados" | "telefonoPrincipal">,
) {
  const answered = (source.telefonosDetalle ?? []).find(
    (phone) => phone.estado === "CONTESTA" && phone.numero?.trim(),
  );
  if (answered) return answered.numero.trim();
  const used = source.telefonosUsados?.split(/[,\n;]+/g).map((item) => item.trim()).find(Boolean);
  return used || source.telefonoPrincipal?.trim() || "";
}

export function resolveReportDeliveryDate(value: Date | string | null | undefined) {
  return formatTemplateDate(value) || NO_DELIVERY_DATE_TEXT;
}

export function resolveReportCanal(canal: string | null | undefined) {
  return formatCanalContacto(canal) || "No especificado";
}

/** Single multi-line message prepared for dispatch / the messenger. */
export function buildContactReportMessage(source: ContactReportSource): string {
  const lines = [
    `Cliente: ${source.cliente}`,
    `TC: ${source.tc}`,
    `Dirección: ${resolveReportAddress(source) || "No especificada"}`,
    `Número de contacto: ${resolveReportPhone(source) || "No especificado"}`,
    `Canal: ${resolveReportCanal(source.canalContacto)}`,
    `Fecha de entrega: ${resolveReportDeliveryDate(source.fechaPreferenciaEntrega)}`,
    `Mensajero: ${source.mensajero?.trim() || "Sin asignar"}${
      source.mensajeroTelefono?.trim() ? ` (${source.mensajeroTelefono.trim()})` : ""
    }`,
  ];
  return lines.join("\n");
}

/** Spanish-labelled export row; column order is the report contract. */
export function buildContactReportRow(source: ContactReportSource): Record<string, string> {
  const resultadoLabel =
    source.resultado && source.resultado in CONTACT_RESULTADO_LABELS
      ? CONTACT_RESULTADO_LABELS[source.resultado as ContactResultado]
      : (source.resultado ?? "");
  return {
    "Fecha gestión": formatTemplateDate(source.createdAt),
    Operador: source.operador ?? "",
    TC: source.tc,
    Cliente: source.cliente,
    "Cédula": source.cedula,
    "Tipo tarjeta": formatTipoTarjeta(source.productType),
    Provincia: source.provincia,
    Zona: source.zona,
    "Dirección recopilada": resolveReportAddress(source),
    "Teléfono de contacto": resolveReportPhone(source),
    Canal: resolveReportCanal(source.canalContacto),
    "Fecha de entrega": resolveReportDeliveryDate(source.fechaPreferenciaEntrega),
    Mensajero: source.mensajero ?? "",
    "Teléfono mensajero": source.mensajeroTelefono ?? "",
    Resultado: resultadoLabel,
    Comentario: source.comentario ?? "",
    Mensaje: buildContactReportMessage(source),
  };
}
