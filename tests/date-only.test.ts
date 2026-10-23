import { describe, expect, it } from "vitest";
import { formatDateOnlyEs, getRecentDateRange } from "../lib/date";
import { compile } from "../lib/list-query";
import { rutasListQuery } from "../lib/list-query/descriptors/rutas";

describe("calendar date semantics", () => {
  it("does not render UTC midnight as the previous Santo Domingo day", () => {
    expect(formatDateOnlyEs("2026-09-14T00:00:00.000Z")).toBe("14/09/2026");
  });

  it("builds an inclusive 30-day default range", () => {
    expect(getRecentDateRange(30, new Date(2026, 8, 16, 10))).toEqual({
      from: "2026-08-18",
      to: "2026-09-16",
    });
  });

  it("compiles route date ranges on UTC calendar boundaries", () => {
    const result = compile(rutasListQuery, new URLSearchParams({ from: "2026-09-14", to: "2026-09-14" }));
    expect(result.where).toEqual({
      fecha: {
        gte: new Date("2026-09-14T00:00:00.000Z"),
        lte: new Date("2026-09-14T23:59:59.999Z"),
      },
    });
  });
});
