import type { OperativeWizardCard, PhoneState } from "@/components/operativo/operative-contact-wizard";
import { isPhoneCallState, type PhoneCallDetail } from "@/lib/contact-call-shared";
import { deriveContactoEstado, type ContactoEstado } from "@/lib/cards/card-tile-data";

/**
 * Calls overhaul: client-side contract of
 * `GET /api/operativo/contacto/[cardId]/historial` and the mapping from it to
 * the contact wizard's card, so the wizard always opens prefilled with the
 * card's saved contact state (whichever list the user came from).
 */

export type CallHistorialCard = {
  id: string;
  tc: string;
  requestNumber: string | null;
  nombre: string;
  cedula: string;
  status: string;
  productType: string | null;
  provincia: string;
  zona: string;
  direccion: string;
  telefonos: string[];
  urgent: boolean;
  slaDueDate: string | null;
  mensajero: { id: string; nombre: string; telefono: string | null } | null;
  operativo: Record<string, unknown>;
  grupos: string[];
  /** Optional so an older payload without ids still maps (to no groups). */
  groupIds?: string[];
  asignacion: {
    asignadoA: { id: string; name: string } | null;
    asignadoPor: { id: string; name: string } | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type CallHistorialEntry = {
  id: string;
  createdAt: string;
  usuario: { id: string; name: string } | null;
  contactado: boolean;
  resultado: string | null;
  canalContacto: string | null;
  telefonosUsados: string | null;
  telefonosDetalle: unknown;
  motivoNoContacto: string | null;
  nuevaDireccion: string | null;
  fechaPreferenciaEntrega: string | null;
  comentario: string | null;
  snapshot: unknown;
};

export type CallHistorialResponse = {
  card: CallHistorialCard;
  historial: CallHistorialEntry[];
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Normalizes the JSON `telefonosDetalle` column into typed rows (invalid entries dropped). */
export function parseTelefonosDetalle(value: unknown): PhoneCallDetail[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      numero: typeof item.numero === "string" ? item.numero : "",
      estado: str(item.estado),
      nota: str(item.nota),
    }))
    .filter((item) => item.numero.trim());
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function savedPhones(card: CallHistorialCard): PhoneState[] {
  const raw = card.operativo.telefonos;
  if (Array.isArray(raw)) {
    const phones = raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .filter((item) => typeof item.num === "string" && item.num.trim())
      .map((item) => ({
        num: String(item.num),
        principal: Boolean(item.principal),
        funciona: Boolean(item.funciona),
        comentario: typeof item.comentario === "string" ? item.comentario : "",
      }));
    if (phones.length) return phones;
  }
  return card.telefonos.map((num, index) => ({ num, principal: index === 0, funciona: false, comentario: "" }));
}

/** Current contact state of the card from its saved operativo metadata. */
export function cardContactoEstado(card: CallHistorialCard, historial: CallHistorialEntry[]): ContactoEstado {
  const op = card.operativo;
  return deriveContactoEstado({
    contactado: op.contactado === true,
    solicitudRetorno: op.solicitudRetorno === true,
    traslado: op.traslado,
    hasAttempt: historial.length > 0 || Boolean(op.updatedAt),
  });
}

/**
 * Builds the wizard card from the historial payload: saved phones (with the
 * per-phone estado / nota of the LAST call merged in), saved contact fields,
 * messenger, SLA and groups for the template context.
 */
export function buildWizardCard(data: CallHistorialResponse): OperativeWizardCard {
  const { card, historial } = data;
  const op = card.operativo;
  const lastDetail = parseTelefonosDetalle(historial[0]?.telefonosDetalle);
  const detailByDigits = new Map(lastDetail.map((item) => [digits(item.numero) || item.numero, item]));

  const telefonos = savedPhones(card).map((phone) => {
    const detail = detailByDigits.get(digits(phone.num) || phone.num);
    const estado = detail?.estado && isPhoneCallState(detail.estado) ? detail.estado : "";
    return {
      ...phone,
      estado,
      comentario: phone.comentario || detail?.nota || "",
    };
  });

  const traslado = op.traslado && typeof op.traslado === "object" ? (op.traslado as Record<string, unknown>) : null;
  const contactado = op.contactado === true;

  return {
    id: card.id,
    cardId: card.id,
    tc: card.tc,
    requestNumber: card.requestNumber,
    nombre: card.nombre,
    cedula: card.cedula,
    provincia: card.provincia,
    zona: card.zona,
    status: card.status,
    urgent: card.urgent,
    direcciones: card.direccion ? [card.direccion] : [],
    refs: [],
    mensajero: card.mensajero?.nombre ?? "Sin asignar",
    mensajeroTelefono: card.mensajero?.telefono ?? null,
    telefonos,
    comentarioContacto: typeof op.comentarioContacto === "string" ? op.comentarioContacto : "",
    contactado,
    canalContacto:
      op.canalContacto === "WHATSAPP" || op.canalContacto === "LLAMADA_DIRECTA" ? op.canalContacto : null,
    nuevaDireccion: str(op.nuevaDireccion),
    fechaPreferenciaEntrega: str(op.fechaPreferenciaEntrega),
    solicitudRetorno: op.solicitudRetorno === true,
    motivoRetorno: str(op.motivoRetorno),
    traslado,
    hasAttempt: historial.length > 0,
    slaDueDate: card.slaDueDate,
    productType: card.productType,
    grupos: card.grupos,
    groupIds: card.groupIds ?? [],
    readOnly: false,
  };
}
