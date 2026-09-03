import type { LotStatus } from "@prisma/client";
import { mapLotStatus } from "@/lib/lot-status";

/**
 * SDD change `rutas-lotes-redesign` — Slice 3 (task 4, batch-added ahead of
 * the tasks artifact's Slice 6 backfill phase, scoped only to this slice's
 * columns: `Lot.estatusTipo` and `LotItem.recibidaAt`/`retornadaAt`).
 *
 * Pure planners, no Prisma import, no DB access — the caller (a script)
 * supplies rows already read from the database and applies the returned
 * `updates` itself. This keeps the report-and-skip logic and idempotency
 * fully unit-testable without a live database, per this batch's hard safety
 * constraint (no live/production DB connection from this executor).
 */

const SAMPLE_ID_LIMIT = 5;

export type LotStatusBackfillRow = { id: string; estatus: string; estatusTipo: LotStatus | null };

export type LotStatusBackfillPlan = {
  updates: Array<{ id: string; estatusTipo: LotStatus }>;
  unmapped: Array<{ value: string; count: number; sampleIds: string[] }>;
};

/**
 * `Lot.estatus` -> `Lot.estatusTipo`. Rows that already carry a typed value
 * are left untouched (idempotent re-run — spec scenario "Re-run is a no-op
 * for already-typed rows"). Rows whose free-text `estatus` has no mapping in
 * `mapLotStatus` are aggregated into `unmapped` by exact raw value (count +
 * up to `SAMPLE_ID_LIMIT` sample ids) and never block other rows (spec
 * scenario "Unmapped value is skipped and reported").
 */
export function buildLotStatusBackfillPlan(rows: readonly LotStatusBackfillRow[]): LotStatusBackfillPlan {
  const updates: LotStatusBackfillPlan["updates"] = [];
  const unmappedByValue = new Map<string, { count: number; sampleIds: string[] }>();

  for (const row of rows) {
    if (row.estatusTipo !== null) continue;

    const mapped = mapLotStatus(row.estatus);
    if (mapped) {
      updates.push({ id: row.id, estatusTipo: mapped });
      continue;
    }

    const entry = unmappedByValue.get(row.estatus) ?? { count: 0, sampleIds: [] };
    entry.count += 1;
    if (entry.sampleIds.length < SAMPLE_ID_LIMIT) entry.sampleIds.push(row.id);
    unmappedByValue.set(row.estatus, entry);
  }

  const unmapped = Array.from(unmappedByValue, ([value, entry]) => ({ value, ...entry }));
  return { updates, unmapped };
}

export type LotItemDateBackfillRow = {
  id: string;
  recibida: string | null;
  retornada: string | null;
  recibidaAt: Date | null;
  retornadaAt: Date | null;
};

export type LotItemDateBackfillPlan = {
  updates: Array<{ id: string; recibidaAt: Date | null; retornadaAt: Date | null }>;
  skipped: Array<{ id: string; reason: "NO_TIMESTAMP_SOURCE"; field: "recibidaAt" | "retornadaAt" }>;
};

/**
 * Mirrors the truthy set `applyLotItemResult`/the lotes GET aggregation use
 * for `recibida`/`retornada` (`app/api/lotes/route.ts`'s `toTruthyValue`).
 * Duplicated here deliberately: that helper is a module-private function in
 * a Next.js `route.ts` file, which cannot be imported by anything outside
 * the route (App Router only allows HTTP method exports).
 */
function isTruthyLegacyFlag(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized === "SI" || normalized === "YES" || normalized === "TRUE" || normalized === "1";
}

/**
 * `LotItem.recibida`/`retornada` -> `recibidaAt`/`retornadaAt`.
 *
 * There is no historical event timestamp stored anywhere on `LotItem`
 * itself, so this pure function never invents one: `resolveTimestamp` is
 * supplied by the caller (the script), which is free to derive it from
 * whatever real signal is available (e.g. a matching `CardStatusLog` row) or
 * to return `null`. A `null` resolution is report-and-skip: the row is
 * listed in `skipped` with reason `NO_TIMESTAMP_SOURCE`, the column stays
 * null (still correctly served by the legacy string field), and the plan
 * continues with the remaining rows.
 *
 * Idempotent by construction: a row whose typed column is already set is
 * left untouched regardless of the legacy flag or resolver result.
 */
export function buildLotItemDateBackfillPlan(
  rows: readonly LotItemDateBackfillRow[],
  resolveTimestamp: (row: LotItemDateBackfillRow, field: "recibidaAt" | "retornadaAt") => Date | null,
): LotItemDateBackfillPlan {
  const updates: LotItemDateBackfillPlan["updates"] = [];
  const skipped: LotItemDateBackfillPlan["skipped"] = [];

  for (const row of rows) {
    let recibidaAt: Date | null = row.recibidaAt;
    let retornadaAt: Date | null = row.retornadaAt;
    let changed = false;

    if (row.recibidaAt === null && isTruthyLegacyFlag(row.recibida)) {
      const resolved = resolveTimestamp(row, "recibidaAt");
      if (resolved) {
        recibidaAt = resolved;
        changed = true;
      } else {
        skipped.push({ id: row.id, reason: "NO_TIMESTAMP_SOURCE", field: "recibidaAt" });
      }
    }

    if (row.retornadaAt === null && isTruthyLegacyFlag(row.retornada)) {
      const resolved = resolveTimestamp(row, "retornadaAt");
      if (resolved) {
        retornadaAt = resolved;
        changed = true;
      } else {
        skipped.push({ id: row.id, reason: "NO_TIMESTAMP_SOURCE", field: "retornadaAt" });
      }
    }

    if (changed) updates.push({ id: row.id, recibidaAt, retornadaAt });
  }

  return { updates, skipped };
}
