import type { FacetConfig, GroupByConfig } from "@/components/filters/filter-bar";
import { CONTACT_RESULTADO_LABELS, CONTACT_RESULTADOS } from "@/lib/contact-call-shared";

/**
 * Calls overhaul: single catalog of card facets shared by every card list
 * (operativo, SLA vencidas, tarjetas). Pages pick facet KEYS (or a preset)
 * instead of redefining labels/options ad hoc, so the same filter always looks
 * and behaves the same everywhere.
 *
 * Pure module: option sources (provinces, groups, messengers, operators) are
 * injected, the React side lives in `components/filters/card-filter-bar.tsx`.
 */

export type CardFacetKey =
  | "provincia"
  | "zona"
  | "status"
  | "productType"
  | "grupo"
  | "messengerId"
  | "contactoEstado"
  | "canalContacto"
  | "asignado"
  | "urgent"
  | "origin";

export type CardFacetSources = {
  provincias?: readonly string[];
  /** Deactivated provinces: listed last so their existing cards stay filterable. */
  inactiveProvincias?: readonly string[];
  groups?: ReadonlyArray<{ id: string; name: string }>;
  messengers?: ReadonlyArray<{ id: string; nombre: string }>;
  operadores?: ReadonlyArray<{ id: string; name: string }>;
  /** Restricts the status options (e.g. open statuses only for call workspaces). */
  statusValues?: readonly string[];
  /** Selected product filter; narrows the status options to that product's statuses. */
  productType?: string | null;
};

export const ZONA_VALUES = ["Metro", "Norte", "Sur", "Este"] as const;

/** Every `CardStatus` value, in workflow order. */
export const ALL_CARD_STATUS_VALUES = [
  "DESPACHADA",
  "ENVIADA_INTERIOR",
  "EN_RUTA",
  "NO_LOCALIZADO",
  "ACUSE_RECIBIDO",
  "DEVUELTA_TIENDA",
  "ENTREGA_DIGITAL",
  "ENTREGADA",
  "RETORNADA",
  "ENTREGA_DIGITAL_SIN_CONTRATO",
  "ENTREGA_SIN_CONTRATO",
  "EN_PROCESO_DE_RETORNO",
  "TD_EN_PROCESO_DE_RETORNO",
  "TD_ENTREGADO",
  "TD_DEVUELTO_NO_LOCALIZADO",
  "TD_NO_LE_INTERESA",
  "TD_RETIRADA_EN_OFICINA",
  "TD_SOLICITADA_POR_ERROR",
  "TD_ZONA_FUERA_COBERTURA",
] as const;

/**
 * Statuses that call workspaces can still act on. Mirrors the complement of
 * `SLA_CLOSED_STATUSES` (`lib/list-query/descriptors/sla-vencidas.ts`), which
 * both `/api/operativo/contacto` and `/api/sla-vencidas` exclude.
 */
export const OPEN_CARD_STATUS_VALUES = [
  "DESPACHADA",
  "ENVIADA_INTERIOR",
  "EN_RUTA",
  "NO_LOCALIZADO",
  "ENTREGA_DIGITAL_SIN_CONTRATO",
  "ENTREGA_SIN_CONTRATO",
  "EN_PROCESO_DE_RETORNO",
  "TD_EN_PROCESO_DE_RETORNO",
] as const;

/** Logistics statuses both products go through before their product-specific outcome. */
const SHARED_CARD_STATUS_VALUES = new Set<string>(["DESPACHADA", "ENVIADA_INTERIOR", "EN_RUTA", "NO_LOCALIZADO"]);

/**
 * Statuses a product can be in: debit cards use the shared logistics statuses
 * plus the `TD_*` ones, credit cards every non-`TD_*` status. Any other value
 * (no product selected) keeps the full list.
 */
export function cardStatusValuesForProduct(productType?: string | null): readonly string[] {
  if (productType === "DEBITO") {
    return ALL_CARD_STATUS_VALUES.filter((value) => value.startsWith("TD_") || SHARED_CARD_STATUS_VALUES.has(value));
  }
  if (productType === "CREDITO") return ALL_CARD_STATUS_VALUES.filter((value) => !value.startsWith("TD_"));
  return ALL_CARD_STATUS_VALUES;
}

/** Drops selected statuses that the selected product can never be in, so the list does not silently go empty. */
export function pruneStatusesForProduct(filters: Record<string, string>): Record<string, string> {
  if (!filters.status) return filters;
  const allowed = new Set(cardStatusValuesForProduct(filters.productType));
  const selected = filters.status.split(",").filter(Boolean);
  const kept = selected.filter((value) => allowed.has(value));
  if (kept.length === selected.length) return filters;
  const next = { ...filters };
  if (kept.length) next.status = kept.join(",");
  else delete next.status;
  return next;
}

/** Same human label `StatusBadge` renders (`TD_X_Y` -> `TD- X Y`). */
export function cardStatusLabel(value: string): string {
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  if (upper.startsWith("TD_")) return upper.replace(/^TD_/, "TD- ").replaceAll("_", " ");
  return value.replaceAll("_", " ");
}

export const ASIGNADO_ME = "ME";
export const ASIGNADO_SIN_ASIGNAR = "SIN_ASIGNAR";

const FACET_BUILDERS: Record<CardFacetKey, (sources: CardFacetSources) => FacetConfig> = {
  provincia: (sources) => ({
    field: "provincia",
    label: "Provincia",
    multi: true,
    options: [
      ...(sources.provincias ?? []).map((value) => ({ label: value, value })),
      ...(sources.inactiveProvincias ?? []).map((value) => ({ label: `${value} (inactiva)`, value })),
    ],
  }),
  zona: () => ({
    field: "zona",
    label: "Zona",
    multi: true,
    options: ZONA_VALUES.map((value) => ({ label: value, value })),
  }),
  status: (sources) => ({
    field: "status",
    label: "Estado",
    multi: true,
    options: (sources.statusValues ?? ALL_CARD_STATUS_VALUES)
      .filter((value) => cardStatusValuesForProduct(sources.productType).includes(value))
      .map((value) => ({
        label: cardStatusLabel(value),
        value,
      })),
  }),
  productType: () => ({
    field: "productType",
    label: "Producto",
    options: [
      { label: "Crédito", value: "CREDITO" },
      { label: "Débito", value: "DEBITO" },
    ],
  }),
  grupo: (sources) => ({
    field: "grupo",
    label: "Grupo",
    multi: true,
    options: [
      ...(sources.groups ?? []).map((group) => ({ label: group.name, value: group.id })),
      { label: "Sin grupo", value: "SIN_GRUPO" },
    ],
  }),
  messengerId: (sources) => ({
    field: "messengerId",
    label: "Mensajero",
    options: (sources.messengers ?? []).map((messenger) => ({ label: messenger.nombre, value: messenger.id })),
  }),
  contactoEstado: () => ({
    field: "contactoEstado",
    label: "Gestión contacto",
    options: CONTACT_RESULTADOS.map((value) => ({ label: CONTACT_RESULTADO_LABELS[value], value })),
  }),
  canalContacto: () => ({
    field: "canalContacto",
    label: "Canal de contacto",
    options: [
      { label: "WhatsApp", value: "WHATSAPP" },
      { label: "Llamada directa", value: "LLAMADA_DIRECTA" },
    ],
  }),
  asignado: (sources) => ({
    field: "asignado",
    label: "Asignado a",
    options: [
      { label: "Asignadas a mí", value: ASIGNADO_ME },
      { label: "Sin asignar", value: ASIGNADO_SIN_ASIGNAR },
      ...(sources.operadores ?? []).map((operador) => ({ label: operador.name, value: operador.id })),
    ],
  }),
  urgent: () => ({
    field: "urgent",
    label: "Urgente",
    options: [{ label: "Solo urgentes", value: "1" }],
  }),
  origin: () => ({
    field: "origin",
    label: "Origen",
    options: [
      { label: "Torre Popular", value: "TORRE_POPULAR" },
      { label: "Centro de Acopio", value: "CENTRO_ACOPIO" },
      { label: "BPD Débito", value: "BPD_DEBITO" },
    ],
  }),
};

/**
 * Facet sets per workspace. `llamadas` is shared VERBATIM by operativo and SLA
 * vencidas: both APIs accept every key listed here.
 */
export const CARD_FACET_PRESETS = {
  llamadas: [
    "asignado",
    "contactoEstado",
    "canalContacto",
    "status",
    "productType",
    "provincia",
    "zona",
    "messengerId",
    "grupo",
    "urgent",
  ],
  tarjetas: ["contactoEstado", "productType", "status", "provincia", "zona", "grupo", "origin", "urgent"],
} as const satisfies Record<string, readonly CardFacetKey[]>;

export type CardFacetPreset = keyof typeof CARD_FACET_PRESETS;

export function buildCardFacets(keys: readonly CardFacetKey[], sources: CardFacetSources = {}): FacetConfig[] {
  return keys.map((key) => FACET_BUILDERS[key](sources));
}

export const CARD_GROUP_BY_CATALOG = {
  provincia: { field: "provincia", label: "Provincia" },
  zona: { field: "zona", label: "Zona" },
  status: { field: "status", label: "Estado" },
  productType: { field: "productType", label: "Producto" },
  contactoEstado: { field: "contactoEstado", label: "Gestión contacto" },
  canalContacto: { field: "canalContacto", label: "Canal de contacto" },
  mensajero: { field: "mensajero", label: "Mensajero" },
  asignado: { field: "asignado", label: "Asignado a" },
  origin: { field: "origin", label: "Origen" },
} as const satisfies Record<string, GroupByConfig>;

export type CardGroupByKey = keyof typeof CARD_GROUP_BY_CATALOG;

export const CARD_GROUP_BY_PRESETS = {
  llamadas: ["contactoEstado", "asignado", "status", "provincia", "zona", "mensajero", "canalContacto"],
  tarjetas: ["contactoEstado", "productType", "origin", "status", "provincia", "zona"],
} as const satisfies Record<CardFacetPreset, readonly CardGroupByKey[]>;

export function buildGroupByOptions(keys: readonly CardGroupByKey[]): GroupByConfig[] {
  return keys.map((key) => CARD_GROUP_BY_CATALOG[key]);
}

/** Which async option sources a facet set needs, so the bar only fetches what it renders. */
export function requiredFacetSources(keys: readonly CardFacetKey[]) {
  return {
    provincias: keys.includes("provincia"),
    groups: keys.includes("grupo"),
    messengers: keys.includes("messengerId"),
    operadores: keys.includes("asignado"),
  };
}
