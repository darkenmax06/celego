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
import {
  buildTarjetasDrillDownParams,
  buildZoneBreakdown,
  parseDashboardProductType,
  productTypeWhere,
} from "@/lib/dashboard/filters";
import { compileCardDateRangeWhere } from "@/lib/list-query/card-date-range";
import { buildSlaPortfolio, businessDaysOverdue, slaDueWindow } from "@/lib/dashboard/sla-portfolio";

describe("buildTarjetasDrillDownParams", () => {
  it("links with the inclusive dispatch-date filter instead of legacy from/to", () => {
    const params = buildTarjetasDrillDownParams({
      from: "2026-10-01",
      to: "2026-10-31",
      productType: "DEBITO",
      extra: { status: "DESPACHADA,ENVIADA_INTERIOR" },
    });
    expect(params.get("date.dispatchDate.from")).toBe("2026-10-01");
    expect(params.get("date.dispatchDate.to")).toBe("2026-10-31");
    expect(params.get("productType")).toBe("DEBITO");
    expect(params.get("status")).toBe("DESPACHADA,ENVIADA_INTERIOR");
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
  });

  it("keeps cards dispatched on the last day of the range", () => {
    const params = buildTarjetasDrillDownParams({ from: "2026-10-01", to: "2026-10-31", productType: "ALL" });
    const { clauses } = compileCardDateRangeWhere(params);
    const range = (clauses[0] as { dispatchDate: { lte: Date } }).dispatchDate;
    expect(range.lte.getTime()).toBeGreaterThan(new Date("2026-10-31T12:00:00Z").getTime());
  });

  it("omits productType for ALL", () => {
    const params = buildTarjetasDrillDownParams({ from: "2026-10-01", to: "2026-10-31", productType: "ALL" });
    expect(params.has("productType")).toBe(false);
  });
});

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

describe("parseDashboardProductType", () => {
  it("accepts the two product types in any case", () => {
    expect(parseDashboardProductType("CREDITO")).toBe("CREDITO");
    expect(parseDashboardProductType(" debito ")).toBe("DEBITO");
  });

  it("falls back to ALL for missing or unknown values", () => {
    expect(parseDashboardProductType(null)).toBe("ALL");
    expect(parseDashboardProductType("")).toBe("ALL");
    expect(parseDashboardProductType("ALL")).toBe("ALL");
    expect(parseDashboardProductType("PREPAGO")).toBe("ALL");
  });

  it("builds no where clause for ALL and a product clause otherwise", () => {
    expect(productTypeWhere("ALL")).toEqual({});
    expect(productTypeWhere("DEBITO")).toEqual({ productType: "DEBITO" });
  });
});

describe("buildZoneBreakdown", () => {
  it("sorts by count, groups blank zones as Sin zona and keeps every card", () => {
    const rows = [
      { zona: "Metro", count: 69 },
      { zona: "", count: 3 },
      { zona: "Este", count: 474 },
      { zona: null, count: 2 },
      { zona: "Sur", count: 0 },
    ];
    const zones = buildZoneBreakdown(rows);
    expect(zones).toEqual([
      { zona: "Este", count: 474 },
      { zona: "Metro", count: 69 },
      { zona: "Sin zona", count: 5 },
    ]);
    expect(zones.reduce((sum, zone) => sum + zone.count, 0)).toBe(rows.reduce((sum, row) => sum + row.count, 0));
  });

  it("returns nothing for an empty range", () => {
    expect(buildZoneBreakdown([])).toEqual([]);
  });
});

describe("buildSlaPortfolio", () => {
  // Monday 2026-11-16, mid-morning local time.
  const now = new Date(2026, 10, 16, 10, 30);
  const day = (d: number, hour = 12) => new Date(2026, 10, d, hour);

  it("splits open cards into al dia, vencidas and sin SLA", () => {
    const portfolio = buildSlaPortfolio(
      [
        { slaDueDate: day(16, 0) }, // due today: still al dia
        { slaDueDate: day(20) },
        { slaDueDate: day(13) }, // Friday: 1 business day overdue
        { slaDueDate: null },
      ],
      now,
    );
    expect(portfolio).toMatchObject({ alDia: 2, vencidas: 1, sinSla: 1, today: "2026-11-16" });
  });

  it("buckets overdue cards by business days and keeps the total", () => {
    const cards = [
      { slaDueDate: day(15) }, // Sunday -> 1
      { slaDueDate: day(11) }, // Wednesday -> 3
      { slaDueDate: day(10) }, // Tuesday -> 4
      { slaDueDate: day(5) }, // Thursday -> 7
      { slaDueDate: day(4) }, // Wednesday -> 8
      { slaDueDate: new Date(2026, 8, 1) },
    ];
    const portfolio = buildSlaPortfolio(cards, now);
    expect(portfolio.buckets.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["d1to3", 2],
      ["d4to7", 2],
      ["d8plus", 2],
    ]);
    expect(portfolio.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(portfolio.vencidas);
  });

  it("returns zeros for an empty portfolio", () => {
    const portfolio = buildSlaPortfolio([], now);
    expect([portfolio.alDia, portfolio.vencidas, portfolio.sinSla]).toEqual([0, 0, 0]);
    expect(portfolio.buckets.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it("counts a weekend due date right before today as one day overdue", () => {
    expect(businessDaysOverdue(now, day(14))).toBe(1);
  });

  it("gives each bucket an slaDueDate window matching its counts", () => {
    expect(slaDueWindow(now, 1, 3)).toEqual({ from: "2026-11-11", to: "2026-11-15" });
    expect(slaDueWindow(now, 4, 7)).toEqual({ from: "2026-11-05", to: "2026-11-10" });
    expect(slaDueWindow(now, 8, null)).toEqual({ from: null, to: "2026-11-04" });
    for (let offset = 1; offset <= 30; offset += 1) {
      const due = new Date(2026, 10, 16 - offset, 12);
      const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
      const bucket = buildSlaPortfolio([{ slaDueDate: due }], now).buckets.find((item) => item.count === 1)!;
      expect(key <= bucket.slaDueTo && (bucket.slaDueFrom === null || key >= bucket.slaDueFrom)).toBe(true);
    }
  });
});
