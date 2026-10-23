import {
  CONTACTO_ESTADO_LABELS,
  deriveContactoEstado,
  type CardTileData,
} from "@/lib/cards/card-tile-data";
import { cardStatusLabel } from "@/lib/filters/card-facets";
import { formatCanalContacto } from "@/lib/contact-template";

/**
 * Calls overhaul: common list item for the call workspaces (operativo and SLA
 * vencidas). Both APIs return different row shapes; mapping them here lets the
 * two pages share tiles, grouping and navigation.
 */

export type CallListItem = CardTileData & {
  /** `null` for unresolved urgent cases that have no linked card (not callable). */
  cardId: string | null;
};

export type OperativoRowLike = {
  id: string;
  cardId: string | null;
  tc: string;
  nombre: string;
  cedula: string;
  provincia: string;
  zona: string;
  status: string;
  contactado?: boolean;
  solicitudRetorno?: boolean;
  traslado?: Record<string, unknown> | null;
  canalContacto?: string | null;
  hasAttempt?: boolean;
  attempts?: number | null;
  remaining?: number | null;
  mensajero?: string | null;
  asignadoA?: { id: string; name: string } | null;
  urgentLabel?: string | null;
};

export type SlaRowLike = {
  id: string;
  tc: string;
  nombre: string;
  cedula: string;
  provincia: string;
  zona: string;
  status: string;
  slaDueDate: string | null;
  diasVencidos: number;
  mensajero?: string | null;
  contactado?: boolean;
  contactoEstado?: string;
  solicitudRetorno?: boolean;
  traslado?: Record<string, unknown> | null;
  canalContacto?: string | null;
  attempts?: number | null;
  asignadoA?: { id: string; name: string } | null;
};

export function callItemFromOperativoRow(row: OperativoRowLike): CallListItem {
  return {
    id: row.id,
    cardId: row.cardId,
    tc: row.tc,
    nombre: row.nombre,
    cedula: row.cedula,
    provincia: row.provincia,
    zona: row.zona,
    status: row.status,
    contactoEstado: deriveContactoEstado({
      contactado: row.contactado,
      solicitudRetorno: row.solicitudRetorno,
      traslado: row.traslado,
      hasAttempt: row.hasAttempt,
    }),
    canalContacto: row.canalContacto ?? null,
    remaining: row.remaining ?? null,
    attempts: row.attempts ?? null,
    asignadoA: row.asignadoA ?? null,
    mensajero: row.mensajero && row.mensajero !== "Sin asignar" ? row.mensajero : "",
    urgentLabel: row.urgentLabel ?? null,
  };
}

export function callItemFromSlaRow(row: SlaRowLike): CallListItem {
  return {
    id: row.id,
    cardId: row.id,
    tc: row.tc,
    nombre: row.nombre,
    cedula: row.cedula,
    provincia: row.provincia,
    zona: row.zona,
    status: row.status,
    contactoEstado: deriveContactoEstado({
      contactoEstado: row.contactoEstado,
      contactado: row.contactado,
      solicitudRetorno: row.solicitudRetorno,
      traslado: row.traslado,
      hasAttempt: typeof row.attempts === "number" ? row.attempts > 0 : undefined,
    }),
    canalContacto: row.canalContacto ?? null,
    slaDueDate: row.slaDueDate,
    diasVencidos: row.diasVencidos,
    attempts: row.attempts ?? null,
    asignadoA: row.asignadoA ?? null,
    mensajero: row.mensajero ?? "",
  };
}

/** Group-by rule shared by both call workspaces (keys from `CARD_GROUP_BY_PRESETS.llamadas`). */
export function callItemGroupKey(item: CallListItem, groupBy: string): { key: string; label: string } {
  switch (groupBy) {
    case "contactoEstado": {
      const state = item.contactoEstado ?? "NO_CONTACTADA";
      return { key: state, label: CONTACTO_ESTADO_LABELS[state] };
    }
    case "asignado":
      return item.asignadoA
        ? { key: item.asignadoA.id, label: item.asignadoA.name }
        : { key: "SIN_ASIGNAR", label: "Sin asignar" };
    case "status":
      return { key: item.status || "SIN_ESTADO", label: item.status ? cardStatusLabel(item.status) : "Sin estado" };
    case "provincia":
      return { key: item.provincia || "SIN_PROVINCIA", label: item.provincia || "Sin provincia" };
    case "zona":
      return { key: item.zona || "SIN_ZONA", label: item.zona || "Sin zona" };
    case "mensajero":
      return { key: item.mensajero || "SIN_MENSAJERO", label: item.mensajero || "Sin mensajero" };
    case "canalContacto":
      return {
        key: item.canalContacto || "SIN_CANAL",
        label: formatCanalContacto(item.canalContacto) || "Sin canal",
      };
    default:
      return { key: "ALL", label: "General" };
  }
}
