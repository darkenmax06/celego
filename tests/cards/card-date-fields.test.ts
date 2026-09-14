import { describe, expect, it } from "vitest";
import {
  compareDateGroupKeys,
  dateGroupToken,
  getCardDateGroup,
  NO_DATE_GROUP_KEY,
  parseDateGroupToken,
} from "@/lib/card-date-fields";

describe("card date grouping", () => {
  it("round-trips group tokens and rejects unknown ones", () => {
    expect(parseDateGroupToken(dateGroupToken("slaDueDate", "month"))).toEqual({
      key: "slaDueDate",
      granularity: "month",
    });
    expect(parseDateGroupToken("fecha:password:day")).toBeNull();
    expect(parseDateGroupToken("status")).toBeNull();
  });

  it("buckets by local day and month with readable labels", () => {
    const card = { dispatchDate: new Date(2026, 7, 5, 12, 0).toISOString() };
    expect(getCardDateGroup(card, "dispatchDate", "day")).toEqual({ key: "2026-08-05", label: "05/08/2026" });
    expect(getCardDateGroup(card, "dispatchDate", "month")).toEqual({ key: "2026-08", label: "Agosto 2026" });
    expect(getCardDateGroup({}, "dispatchDate", "day")).toEqual({ key: NO_DATE_GROUP_KEY, label: "Sin fecha" });
  });

  it("reads the operativo preference date from metadata without shifting the day", () => {
    const card = { metadata: { operativo: { fechaPreferenciaEntrega: "2026-08-20" } } };
    expect(getCardDateGroup(card, "fechaPreferenciaEntrega", "day").key).toBe("2026-08-20");
  });

  it("sorts chronologically with the no-date bucket last", () => {
    expect(["2026-09-01", NO_DATE_GROUP_KEY, "2026-08-31"].sort(compareDateGroupKeys)).toEqual([
      "2026-08-31",
      "2026-09-01",
      NO_DATE_GROUP_KEY,
    ]);
  });
});
