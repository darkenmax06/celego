import { CONTACT_RESULTADO_LABELS, type ContactResultado } from "@/lib/contact-call-shared";

/**
 * Calls overhaul: view model of the reusable card tile
 * (`components/cards/card-tile.tsx`). Every list (tarjetas, operativo, SLA
 * vencidas) maps its API rows into this shape so one presentational
 * component renders them all.
 */

/** `PENDIENTE` = never attempted; the other values match `ContactLog.resultado`. */
export type ContactoEstado = ContactResultado | "PENDIENTE";

export const CONTACTO_ESTADO_LABELS: Record<ContactoEstado, string> = {
  ...CONTACT_RESULTADO_LABELS,
  PENDIENTE: "Pendiente",
};

export type CardTileData = {
  id: string;
  tc: string;
  nombre: string;
  cedula: string;
  provincia: string;
  zona: string;
  status: string;
  contactoEstado?: ContactoEstado | null;
  canalContacto?: string | null;
  isRemote?: boolean;
  slaDueDate?: string | null;
  /** Business days past the SLA (SLA vencidas). */
  diasVencidos?: number | null;
  /** Business days left before the SLA (operativo). */
  remaining?: number | null;
  attempts?: number | null;
  asignadoA?: { id: string; name: string } | null;
  mensajero?: string | null;
  urgentLabel?: string | null;
};

const CONTACT_STATE_SET = new Set<string>(["CONTACTADA", "NO_CONTACTADA", "RETORNO_SOLICITADO", "TRASLADO_SOLICITADO"]);

function hasTraslado(traslado: unknown): boolean {
  return Boolean(traslado && typeof traslado === "object" && Object.keys(traslado).length > 0);
}

/**
 * Single rule for a card's contact state, shared by every list: return beats
 * transfer beats contacted; a never-attempted card is `PENDIENTE` when the
 * caller knows (`hasAttempt === false`).
 */
export function deriveContactoEstado(input: {
  contactoEstado?: string | null;
  contactado?: boolean | null;
  solicitudRetorno?: boolean | null;
  traslado?: unknown;
  hasAttempt?: boolean | null;
}): ContactoEstado {
  if (input.solicitudRetorno || input.contactoEstado === "RETORNO_SOLICITADO") return "RETORNO_SOLICITADO";
  if (hasTraslado(input.traslado) || input.contactoEstado === "TRASLADO_SOLICITADO") return "TRASLADO_SOLICITADO";
  if (input.contactado || input.contactoEstado === "CONTACTADA") return "CONTACTADA";
  if (input.hasAttempt === false) return "PENDIENTE";
  if (input.contactoEstado && CONTACT_STATE_SET.has(input.contactoEstado)) {
    return input.contactoEstado as ContactResultado;
  }
  return "NO_CONTACTADA";
}
