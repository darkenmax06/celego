import { describe, expect, it } from "vitest";
import { buildLotItemDateBackfillPlan, buildLotStatusBackfillPlan } from "@/lib/lot-typed-backfill";

/**
 * SDD change `rutas-lotes-redesign` — Slice 3 (task 4, batch-added).
 *
 * Pure, DB-free backfill planners for the typed columns added in this slice:
 * `Lot.estatusTipo` (report-and-skip via `mapLotStatus`) and
 * `LotItem.recibidaAt`/`retornadaAt` (report-and-skip when no historical
 * timestamp source is available — the caller supplies `resolveTimestamp`,
 * keeping any DB-specific timestamp-sourcing policy out of this pure module).
 * The script wrapper (`scripts/backfill-lot-typed-columns.ts`) is NOT run
 * against any real database in this batch; only these pure planners are
 * exercised.
 */

describe("buildLotStatusBackfillPlan", () => {
  it("plans an update for a recognized value with a null typed column", () => {
    const plan = buildLotStatusBackfillPlan([
      { id: "lot-1", estatus: "EN TRANSITO", estatusTipo: null },
    ]);
    expect(plan.updates).toEqual([{ id: "lot-1", estatusTipo: "EN_TRANSITO" }]);
    expect(plan.unmapped).toEqual([]);
  });

  it("plans an update for the other recognized value", () => {
    const plan = buildLotStatusBackfillPlan([
      { id: "lot-2", estatus: "pendiente", estatusTipo: null },
    ]);
    expect(plan.updates).toEqual([{ id: "lot-2", estatusTipo: "PENDIENTE" }]);
  });

  it("is a no-op for a row already backfilled (idempotent re-run)", () => {
    const plan = buildLotStatusBackfillPlan([
      { id: "lot-3", estatus: "EN TRANSITO", estatusTipo: "EN_TRANSITO" },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.unmapped).toEqual([]);
  });

  it("report-and-skip: aggregates an unmapped value by count and sample ids, does not block other rows", () => {
    const plan = buildLotStatusBackfillPlan([
      { id: "lot-4", estatus: "RECIBIDO EN BANCO", estatusTipo: null },
      { id: "lot-5", estatus: "RECIBIDO EN BANCO", estatusTipo: null },
      { id: "lot-6", estatus: "EN TRANSITO", estatusTipo: null },
    ]);
    expect(plan.updates).toEqual([{ id: "lot-6", estatusTipo: "EN_TRANSITO" }]);
    expect(plan.unmapped).toEqual([
      { value: "RECIBIDO EN BANCO", count: 2, sampleIds: ["lot-4", "lot-5"] },
    ]);
  });
});

describe("buildLotItemDateBackfillPlan", () => {
  it("plans recibidaAt when recibida is truthy, the column is null, and a timestamp resolves", () => {
    const stamp = new Date("2026-08-01T00:00:00.000Z");
    const plan = buildLotItemDateBackfillPlan(
      [{ id: "item-1", recibida: "SI", retornada: null, recibidaAt: null, retornadaAt: null }],
      () => stamp,
    );
    expect(plan.updates).toEqual([{ id: "item-1", recibidaAt: stamp, retornadaAt: null }]);
    expect(plan.skipped).toEqual([]);
  });

  it("plans retornadaAt when retornada is truthy, the column is null, and a timestamp resolves", () => {
    const stamp = new Date("2026-08-02T00:00:00.000Z");
    const plan = buildLotItemDateBackfillPlan(
      [{ id: "item-2", recibida: null, retornada: "YES", recibidaAt: null, retornadaAt: null }],
      () => stamp,
    );
    expect(plan.updates).toEqual([{ id: "item-2", recibidaAt: null, retornadaAt: stamp }]);
  });

  it("is a no-op when neither legacy field is truthy", () => {
    const plan = buildLotItemDateBackfillPlan(
      [{ id: "item-3", recibida: null, retornada: null, recibidaAt: null, retornadaAt: null }],
      () => new Date(),
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it("is a no-op (idempotent) when the typed column is already set", () => {
    const already = new Date("2026-07-01T00:00:00.000Z");
    const plan = buildLotItemDateBackfillPlan(
      [{ id: "item-4", recibida: "SI", retornada: null, recibidaAt: already, retornadaAt: null }],
      () => new Date("2026-08-05T00:00:00.000Z"),
    );
    expect(plan.updates).toEqual([]);
  });

  it("report-and-skip: no timestamp source leaves the row out of updates and lists it as skipped", () => {
    const plan = buildLotItemDateBackfillPlan(
      [{ id: "item-5", recibida: "SI", retornada: null, recibidaAt: null, retornadaAt: null }],
      () => null,
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "item-5", reason: "NO_TIMESTAMP_SOURCE", field: "recibidaAt" }]);
  });
});
