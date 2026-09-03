import { describe, expect, it } from "vitest";
import { parseDate } from "../../lib/importers/card-normalize";

function iso(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

describe("parseDate", () => {
  it("reads slash dates day first, not month first", () => {
    // new Date("09/07/2026") would give 2026-09-07 — the bug that transposed
    // day and month on 254 production cards.
    expect(iso(parseDate("09/07/2026"))).toBe("2026-07-09");
    expect(iso(parseDate("21/05/2026"))).toBe("2026-05-21");
  });

  it("accepts dashes and dots as separators", () => {
    expect(iso(parseDate("09-07-2026"))).toBe("2026-07-09");
    expect(iso(parseDate("09.07.2026"))).toBe("2026-07-09");
  });

  it("accepts single-digit day and month", () => {
    expect(iso(parseDate("9/7/2026"))).toBe("2026-07-09");
  });

  it("expands two-digit years into the current century", () => {
    expect(iso(parseDate("09/07/26"))).toBe("2026-07-09");
  });

  it("keeps year-first dates as written", () => {
    expect(iso(parseDate("2026-07-09"))).toBe("2026-07-09");
  });

  it("rejects a day that does not exist in the month", () => {
    expect(parseDate("31/02/2026")).toBeNull();
  });

  it("rejects a month above twelve instead of rolling it over", () => {
    expect(parseDate("09/13/2026")).toBeNull();
  });

  it("passes through Date cells and Excel serial numbers", () => {
    const cell = new Date(Date.UTC(2026, 6, 9));
    expect(parseDate(cell)).toBe(cell);
    expect(iso(parseDate(46212))).toBe("2026-07-09");
  });

  it("returns null for empty cells", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("  ")).toBeNull();
  });
});
