import type { CardStatus } from "@prisma/client";

// Plain string lists (type-only Prisma import) so client components can share them.

/** Statuses counted as "En posesión": the card is still with the company. */
export const IN_POSSESSION_STATUSES = ["DESPACHADA", "ENVIADA_INTERIOR"] as const satisfies readonly CardStatus[];

/** Statuses counted as "En ruta". */
export const EN_ROUTE_STATUSES = ["EN_RUTA"] as const satisfies readonly CardStatus[];

/** Credit and debit (TD-*) statuses that close the cycle as a delivery. */
export const DELIVERED_STATUSES = [
  "ENTREGADA",
  "ENTREGA_DIGITAL",
  "ENTREGA_SIN_CONTRATO",
  "ENTREGA_DIGITAL_SIN_CONTRATO",
  "TD_ENTREGADO",
] as const satisfies readonly CardStatus[];

/** Credit and debit (TD-*) statuses that close the cycle as a return. */
export const RETURNED_STATUSES = [
  "RETORNADA",
  "TD_DEVUELTO_NO_LOCALIZADO",
  "TD_NO_LE_INTERESA",
  "TD_RETIRADA_EN_OFICINA",
  "TD_SOLICITADA_POR_ERROR",
  "TD_ZONA_FUERA_COBERTURA",
] as const satisfies readonly CardStatus[];

export type StatusSegmentKey = "enPosesion" | "enRuta" | "entregadas" | "retornadas" | "otros";

export type StatusSegment = {
  key: StatusSegmentKey;
  label: string;
  color: string;
  value: number;
  /** Statuses that make up the segment; for "otros" only the ones present in the range. */
  statuses: string[];
};

const GROUPS: Array<{ key: Exclude<StatusSegmentKey, "otros">; label: string; color: string; statuses: readonly string[] }> = [
  { key: "enPosesion", label: "En posesión", color: "#3b82f6", statuses: IN_POSSESSION_STATUSES },
  { key: "enRuta", label: "En ruta", color: "#f59e0b", statuses: EN_ROUTE_STATUSES },
  { key: "entregadas", label: "Entregadas", color: "#10b981", statuses: DELIVERED_STATUSES },
  { key: "retornadas", label: "Retornadas", color: "#8b5cf6", statuses: RETURNED_STATUSES },
];

export function sumStatuses(statusMap: Record<string, number>, statuses: readonly string[]) {
  return statuses.reduce((total, status) => total + (statusMap[status] ?? 0), 0);
}

/**
 * Splits the range status counts into the dashboard card groups plus "Otros",
 * so the segments always add up to the range total.
 */
export function buildStatusSegments(statusBreakdown: Array<{ status: string; count: number }>): StatusSegment[] {
  const statusMap = Object.fromEntries(statusBreakdown.map((row) => [row.status, row.count]));
  const grouped = new Set(GROUPS.flatMap((group) => group.statuses));
  const segments: StatusSegment[] = GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    color: group.color,
    value: sumStatuses(statusMap, group.statuses),
    statuses: [...group.statuses],
  }));
  const others = statusBreakdown.filter((row) => !grouped.has(row.status) && row.count > 0);
  segments.push({
    key: "otros",
    label: "Otros",
    color: "#94a3b8",
    value: others.reduce((total, row) => total + row.count, 0),
    statuses: others.map((row) => row.status),
  });
  return segments;
}
