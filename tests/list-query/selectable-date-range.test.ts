import { describe, expect, it } from "vitest";
import { compile, defineListQuery, ListQueryValidationError } from "../../lib/list-query";
import {
  dateRangeChipLabel,
  dateRangeChipRemovalKeys,
  matchesDateRange,
  normalizeDateRangeFilters,
  readDateRanges,
  withDateRange,
} from "../../lib/date-range-params";

type TestWhere = Record<string, unknown>;

const descriptor = defineListQuery<TestWhere>({
  key: "selectable-date",
  searchFields: [],
  filters: [
    { kind: "dateRange", field: "dispatchDate", fromParam: "from", toParam: "to", boundaries: "instant" },
    {
      kind: "selectableDateRange",
      fields: { dispatchDate: "dispatchDate", slaDueDate: "slaDueDate", createdAt: "createdAt" },
      legacy: { fieldParam: "dateField", fromParam: "dateFrom", toParam: "dateTo", defaultField: "dispatchDate" },
    },
  ],
  sort: { keys: {}, fallbackOrderBy: [{ updatedAt: "desc" }] },
  pagination: { defaultPageSize: 50, maxPageSize: 400 },
});

function params(init: Record<string, string> = {}) {
  return new URLSearchParams(init);
}

type Range = { gte?: Date; lte?: Date };

describe("selectableDateRange filter", () => {
  it("applies a per-field range with `to` inclusive of its own local day", () => {
    const { where } = compile(
      descriptor,
      params({ "date.slaDueDate.from": "2026-08-01", "date.slaDueDate.to": "2026-08-31" }),
    );
    expect(Object.keys(where)).toEqual(["slaDueDate"]);
    const range = where.slaDueDate as Range;
    expect(range.gte).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(range.lte).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it("AND-combines several fields at once", () => {
    const { where, impossible } = compile(
      descriptor,
      params({
        "date.dispatchDate.from": "2026-09-01",
        "date.dispatchDate.to": "2026-09-30",
        "date.slaDueDate.from": "2026-09-14",
        "date.slaDueDate.to": "2026-09-20",
      }),
    );
    expect(impossible).toBe(false);
    expect(Object.keys(where).sort()).toEqual(["dispatchDate", "slaDueDate"]);
    expect((where.dispatchDate as Range).gte).toEqual(new Date(2026, 8, 1));
    expect((where.slaDueDate as Range).lte).toEqual(new Date(2026, 8, 20, 23, 59, 59, 999));
  });

  it("accepts a single bound", () => {
    const { where } = compile(descriptor, params({ "date.createdAt.to": "2026-08-31" }));
    expect(Object.keys(where.createdAt as Range)).toEqual(["lte"]);
  });

  it("maps the legacy dateField/dateFrom/dateTo form onto the per-field form", () => {
    const legacy = compile(
      descriptor,
      params({ dateField: "slaDueDate", dateFrom: "2026-08-01", dateTo: "2026-08-31" }),
    ).where;
    const current = compile(
      descriptor,
      params({ "date.slaDueDate.from": "2026-08-01", "date.slaDueDate.to": "2026-08-31" }),
    ).where;
    expect(legacy).toEqual(current);
  });

  it("falls back to the legacy default field when dateField is absent", () => {
    const { where } = compile(descriptor, params({ dateTo: "2026-08-31" }));
    expect(Object.keys(where.dispatchDate as Range)).toEqual(["lte"]);
  });

  it("lets an explicit per-field bound win over the legacy one", () => {
    const { where } = compile(
      descriptor,
      params({ dateField: "createdAt", dateFrom: "2026-01-01", "date.createdAt.from": "2026-05-01" }),
    );
    expect((where.createdAt as Range).gte).toEqual(new Date(2026, 4, 1));
  });

  it("adds no clause without bounds", () => {
    expect(compile(descriptor, params({ dateField: "createdAt", "date.slaDueDate.from": "" })).where).toEqual({});
  });

  it("rejects a field outside the whitelist, including prototype keys", () => {
    for (const field of ["password", "constructor"]) {
      expect(() => compile(descriptor, params({ [`date.${field}.from`]: "2026-08-01" }))).toThrow(
        ListQueryValidationError,
      );
      expect(() => compile(descriptor, params({ dateField: field, dateFrom: "2026-08-01" }))).toThrow(
        ListQueryValidationError,
      );
    }
  });

  it("keeps the legacy `from`/`to` and a date range on the same column as separate conjuncts", () => {
    const { where } = compile(
      descriptor,
      params({ from: "2026-01-01", "date.dispatchDate.to": "2026-09-30" }),
    );
    expect(where).toEqual({
      AND: [
        { dispatchDate: { gte: expect.any(Date) } },
        { dispatchDate: { lte: new Date(2026, 8, 30, 23, 59, 59, 999) } },
      ],
    });
  });

  it("flags an inverted range as impossible", () => {
    const compiled = compile(
      descriptor,
      params({ "date.dispatchDate.from": "2026-09-02", "date.dispatchDate.to": "2026-09-01" }),
    );
    expect(compiled.impossible).toBe(true);
  });
});

describe("date range filter helpers", () => {
  it("normalizes legacy keys and reads every active field", () => {
    const filters = normalizeDateRangeFilters({
      status: "EN_RUTA",
      dateField: "slaDueDate",
      dateFrom: "2026-09-01",
      "date.createdAt.to": "2026-09-10",
    });
    expect(filters).toEqual({
      status: "EN_RUTA",
      "date.slaDueDate.from": "2026-09-01",
      "date.createdAt.to": "2026-09-10",
    });
    expect(readDateRanges(filters)).toEqual({
      slaDueDate: { from: "2026-09-01" },
      createdAt: { to: "2026-09-10" },
    });
  });

  it("sets and clears one field without touching the others", () => {
    const base = { "date.slaDueDate.from": "2026-09-01", "date.createdAt.to": "2026-09-10" };
    const set = withDateRange(base, "slaDueDate", { from: "2026-09-02", to: "2026-09-05" });
    expect(set).toEqual({
      "date.slaDueDate.from": "2026-09-02",
      "date.slaDueDate.to": "2026-09-05",
      "date.createdAt.to": "2026-09-10",
    });
    expect(withDateRange(set, "slaDueDate", undefined)).toEqual({ "date.createdAt.to": "2026-09-10" });
  });

  it("renders one chip per field and removes both bounds with it", () => {
    const fields = [{ value: "slaDueDate", label: "Vencimiento SLA" }];
    const filters = { "date.slaDueDate.from": "2026-09-01", "date.slaDueDate.to": "2026-09-14" };
    expect(dateRangeChipLabel(filters, "date.slaDueDate.from", fields)).toBe(
      "Vencimiento SLA: 01/09/2026 - 14/09/2026",
    );
    expect(dateRangeChipLabel(filters, "date.slaDueDate.to", fields)).toBeNull();
    expect(dateRangeChipLabel(filters, "status", fields)).toBeUndefined();
    expect(dateRangeChipRemovalKeys("date.slaDueDate.to")).toEqual([
      "date.slaDueDate.from",
      "date.slaDueDate.to",
    ]);
  });

  it("matches loaded rows by local calendar day, inclusively", () => {
    const range = { from: "2026-09-01", to: "2026-09-14" };
    expect(matchesDateRange(new Date(2026, 8, 14, 23, 30), range)).toBe(true);
    expect(matchesDateRange(new Date(2026, 8, 15, 0, 1), range)).toBe(false);
    expect(matchesDateRange("2026-09-01", range)).toBe(true);
    expect(matchesDateRange(null, range)).toBe(false);
    expect(matchesDateRange(null, {})).toBe(true);
  });
});
