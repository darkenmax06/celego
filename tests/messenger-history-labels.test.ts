import { describe, expect, it } from "vitest";
import { formatHistoryCounts } from "@/lib/messenger-history-labels";

describe("formatHistoryCounts", () => {
  it("lists every blocking relation with a Spanish label", () => {
    expect(formatHistoryCounts({ routes: 27, dailyRecords: 33, payments: 11 })).toBe(
      "27 rutas, 33 registros diarios y 11 pagos",
    );
  });

  it("uses the singular label for a count of one", () => {
    expect(formatHistoryCounts({ loans: 1 })).toBe("1 prestamo");
    expect(formatHistoryCounts({ reports: 1, payrollLocks: 2 })).toBe("1 reporte y 2 bloqueos de periodo");
  });

  it("skips zero counts and keeps unknown relations readable", () => {
    expect(formatHistoryCounts({ routes: 0, somethingNew: 4 })).toBe("4 somethingNew");
  });

  it("returns an empty string when nothing is counted", () => {
    expect(formatHistoryCounts({})).toBe("");
    expect(formatHistoryCounts(undefined)).toBe("");
  });
});
