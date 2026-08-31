import type { LotStatus } from "@prisma/client";

/**
 * Free-text `Lot.estatus` -> typed `LotStatus`.
 *
 * SDD `rutas-lotes-redesign`, Slice 3 (task 3.1/3.3). See `LotStatus`'s doc
 * comment in `prisma/schema.prisma` for why this map is intentionally
 * minimal: only the two literal values confirmed in code today are mapped.
 * Everything else is report-and-skip — callers must leave `estatusTipo` null
 * and keep serving reads from the legacy `estatus` string column; this
 * function never throws.
 */
const LOT_STATUS_MAP: Record<string, LotStatus> = {
  "EN TRANSITO": "EN_TRANSITO",
  PENDIENTE: "PENDIENTE",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

export function mapLotStatus(raw: string | null | undefined): LotStatus | null {
  if (!raw) return null;
  const normalized = normalize(raw);
  if (!normalized) return null;
  return LOT_STATUS_MAP[normalized] ?? null;
}
