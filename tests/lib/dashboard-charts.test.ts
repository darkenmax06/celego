import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { DEBIT_RETURN_STATUSES } from "@/lib/debit-status";
import { DAILY_FLOW_MAX_DAYS, cappedFromKey, fillDailyFlow } from "@/lib/dashboard/daily-flow";
import {
  DELIVERED_STATUSES,
  RETURNED_STATUSES,
  buildStatusSegments,
  sumStatuses,
} from "@/lib/dashboard/status-segments";

describe("fillDailyFlow", () => {
  it("returns one zero-filled point per day in order", () => {
    const points = fillDailyFlow("2026-09-29", "2026-10-02", []);
    expect(points.map((point) => point.date)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(points[0]).toEqual({ date: "2026-09-29", despachadas: 0, contactadas: 0, entregadas: 0, retornadas: 0 });
  });

  it("merges rows into their day and series", () => {
    const points = fillDailyFlow("2026-10-01", "2026-10-02", [
      { date: "2026-10-01", series: "despachadas", count: 40 },
      { date: "2026-10-01", series: "entregadas", count: 12 },
      { date: "2026-10-02", series: "contactadas", count: 7 },
      { date: "2026-10-02", series: "retornadas", count: 3 },
    ]);
    expect(points).toEqual([
      { date: "2026-10-01", despachadas: 40, contactadas: 0, entregadas: 12, retornadas: 0 },
      { date: "2026-10-02", despachadas: 0, contactadas: 7, entregadas: 0, retornadas: 3 },
    ]);
  });

  it("ignores rows outside the range", () => {
    const points = fillDailyFlow("2026-10-01", "2026-10-01", [{ date: "2026-09-30", series: "despachadas", count: 5 }]);
    expect(points).toEqual([{ date: "2026-10-01", despachadas: 0, contactadas: 0, entregadas: 0, retornadas: 0 }]);
  });

  it("keeps only the most recent days of a long range", () => {
    const points = fillDailyFlow("2024-01-01", "2026-10-30", []);
    expect(points).toHaveLength(DAILY_FLOW_MAX_DAYS);
    expect(points.at(-1)?.date).toBe("2026-10-30");
    expect(points[0].date).toBe(cappedFromKey("2024-01-01", "2026-10-30"));
  });

  it("does not cap a short range", () => {
    expect(cappedFromKey("2026-10-01", "2026-10-30")).toBe("2026-10-01");
  });
});

describe("buildStatusSegments", () => {
  const breakdown = [
    { status: "DESPACHADA", count: 15 },
    { status: "ENVIADA_INTERIOR", count: 0 },
    { status: "EN_RUTA", count: 580 },
    { status: "ENTREGADA", count: 962 },
    { status: "ENTREGA_DIGITAL", count: 162 },
    { status: "ENTREGA_DIGITAL_SIN_CONTRATO", count: 16 },
    { status: "TD_ENTREGADO", count: 914 },
    { status: "RETORNADA", count: 333 },
    { status: "TD_DEVUELTO_NO_LOCALIZADO", count: 83 },
    { status: "TD_ZONA_FUERA_COBERTURA", count: 14 },
    { status: "NO_LOCALIZADO", count: 34 },
    { status: "EN_PROCESO_DE_RETORNO", count: 9 },
    { status: "ACUSE_RECIBIDO", count: 0 },
  ];

  it("groups statuses like the dashboard cards", () => {
    const values = Object.fromEntries(buildStatusSegments(breakdown).map((segment) => [segment.key, segment.value]));
    expect(values).toEqual({ enPosesion: 15, enRuta: 580, entregadas: 2054, retornadas: 430, otros: 43 });
  });

  it("puts every remaining status in Otros so the total matches the range", () => {
    const segments = buildStatusSegments(breakdown);
    const total = breakdown.reduce((sum, row) => sum + row.count, 0);
    expect(segments.reduce((sum, segment) => sum + segment.value, 0)).toBe(total);
    expect(segments.find((segment) => segment.key === "otros")?.statuses).toEqual(["NO_LOCALIZADO", "EN_PROCESO_DE_RETORNO"]);
  });

  it("returns zero segments for an empty range", () => {
    const segments = buildStatusSegments([]);
    expect(segments.map((segment) => segment.value)).toEqual([0, 0, 0, 0, 0]);
    expect(segments.find((segment) => segment.key === "otros")?.statuses).toEqual([]);
  });

  it("matches the card metrics computed with the same lists", () => {
    const statusMap = Object.fromEntries(breakdown.map((row) => [row.status, row.count]));
    const segments = buildStatusSegments(breakdown);
    expect(segments.find((segment) => segment.key === "entregadas")?.value).toBe(sumStatuses(statusMap, DELIVERED_STATUSES));
    expect(segments.find((segment) => segment.key === "retornadas")?.value).toBe(sumStatuses(statusMap, RETURNED_STATUSES));
  });

  it("keeps the returned list in sync with the debit return statuses", () => {
    expect(RETURNED_STATUSES.slice(1)).toEqual([...DEBIT_RETURN_STATUSES]);
  });
});
