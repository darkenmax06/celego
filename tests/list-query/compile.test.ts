import { describe, expect, it } from "vitest";
import {
  buildListEnvelope,
  compile,
  defineListQuery,
  ListQueryValidationError,
} from "../../lib/list-query";

type TestWhere = Record<string, unknown>;

const descriptor = defineListQuery<TestWhere>({
  key: "test",
  searchFields: ["tc", "externalReference", "customer.cedula", "customer.nombre"],
  filters: [
    { kind: "enum", param: "status", field: "status", values: ["PENDIENTE", "EN_RUTA", "ENTREGADA"] },
    { kind: "enum", param: "provincia", field: "provincia", values: ["SANTIAGO", "SANTO_DOMINGO"] },
    { kind: "boolean", param: "urgent", field: "urgent" },
    { kind: "boolean", param: "remote", field: "isRemote" },
    { kind: "dateRange", field: "dispatchDate", fromParam: "from", toParam: "to" },
  ],
  sort: {
    keys: { updatedAt: "updatedAt", dispatchDate: "dispatchDate", cedula: "customer.cedula" },
    fallbackOrderBy: [{ updatedAt: "desc" }],
  },
  pagination: { defaultPageSize: 25, maxPageSize: 200 },
});

function params(init: Record<string, string> = {}) {
  return new URLSearchParams(init);
}

describe("R1.1 search whitelist", () => {
  it("searches every declared field, including relation paths, as a nested OR", () => {
    const { where } = compile(descriptor, params({ q: "abc" }));
    expect(where.OR).toEqual([
      { tc: { contains: "abc", mode: "insensitive" } },
      { externalReference: { contains: "abc", mode: "insensitive" } },
      { customer: { cedula: { contains: "abc", mode: "insensitive" } } },
      { customer: { nombre: { contains: "abc", mode: "insensitive" } } },
    ]);
  });

  it("ignores an unlisted field path instead of querying it", () => {
    const { where } = compile(descriptor, params({ q: "abc", qFields: "customer.cedula,password" }));
    expect(where.OR).toEqual([{ customer: { cedula: { contains: "abc", mode: "insensitive" } } }]);
  });

  it("falls back to the full whitelist when every requested path is unlisted", () => {
    const { where } = compile(descriptor, params({ q: "abc", qFields: "password" }));
    expect(where.OR).toHaveLength(4);
  });

  it("applies no search constraint at all for a blank q", () => {
    expect(compile(descriptor, params({ q: "   " })).where).toEqual({});
  });
});

describe("R1.2 enum filters", () => {
  it("treats the ALL sentinel as no constraint rather than undefined", () => {
    const { where } = compile(descriptor, params({ status: "ALL" }));
    expect(where).toEqual({});
    expect("status" in where).toBe(false);
  });

  it("applies a whitelisted enum value", () => {
    expect(compile(descriptor, params({ status: "EN_RUTA" })).where).toEqual({ status: "EN_RUTA" });
  });

  it("rejects an unknown enum value instead of silently dropping it", () => {
    expect(() => compile(descriptor, params({ status: "NO_EXISTE" }))).toThrow(
      ListQueryValidationError,
    );
    try {
      compile(descriptor, params({ status: "NO_EXISTE" }));
    } catch (error) {
      expect((error as ListQueryValidationError).code).toBe("INVALID_ENUM_VALUE");
      expect((error as ListQueryValidationError).param).toBe("status");
    }
  });

  it("treats an absent and an empty enum param as no constraint", () => {
    expect(compile(descriptor, params({})).where).toEqual({});
    expect(compile(descriptor, params({ status: "" })).where).toEqual({});
  });
});

describe("R1.3 boolean filters", () => {
  it('maps "1" to true and "0" to false', () => {
    expect(compile(descriptor, params({ urgent: "1" })).where).toEqual({ urgent: true });
    expect(compile(descriptor, params({ remote: "0" })).where).toEqual({ isRemote: false });
  });

  it("treats any other encoding as absent", () => {
    for (const value of ["true", "false", "ALL", "yes", "2", ""]) {
      expect(compile(descriptor, params({ urgent: value })).where).toEqual({});
    }
  });
});

describe("R1.4 date ranges", () => {
  it("applies an inclusive range in the database", () => {
    const { where } = compile(descriptor, params({ from: "2026-01-01", to: "2026-01-31" }));
    expect(where.dispatchDate).toEqual({
      gte: new Date("2026-01-01T00:00:00.000Z"),
      lte: new Date("2026-01-31T23:59:59.999Z"),
    });
  });

  it("applies an open-ended range from either bound alone", () => {
    expect(compile(descriptor, params({ from: "2026-01-01" })).where.dispatchDate).toEqual({
      gte: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(compile(descriptor, params({ to: "2026-01-31" })).where.dispatchDate).toEqual({
      lte: new Date("2026-01-31T23:59:59.999Z"),
    });
  });

  it("yields an empty result rather than an error when from is after to", () => {
    const result = compile(descriptor, params({ from: "2026-02-01", to: "2026-01-01" }));
    expect(result.impossible).toBe(true);
    expect(result.where.dispatchDate).toEqual({
      gte: new Date("2026-02-01T00:00:00.000Z"),
      lte: new Date("2026-01-01T23:59:59.999Z"),
    });
  });

  it("ignores an unparseable date instead of throwing", () => {
    expect(compile(descriptor, params({ from: "not-a-date" })).where).toEqual({});
  });
});

describe("R1.5 sort whitelist", () => {
  it("defaults to the resource's current hardcoded ordering", () => {
    expect(compile(descriptor, params({})).orderBy).toEqual([{ updatedAt: "desc" }]);
  });

  it("falls back to that same ordering for a non-whitelisted sort key", () => {
    expect(compile(descriptor, params({ sort: "password" })).orderBy).toEqual([
      { updatedAt: "desc" },
    ]);
  });

  it("applies a whitelisted sort key with order defaulting to desc", () => {
    expect(compile(descriptor, params({ sort: "dispatchDate" })).orderBy).toEqual([
      { dispatchDate: "desc" },
    ]);
  });

  it("honours an explicit asc order", () => {
    expect(compile(descriptor, params({ sort: "dispatchDate", order: "asc" })).orderBy).toEqual([
      { dispatchDate: "asc" },
    ]);
  });

  it("defaults to desc for a non-whitelisted order value", () => {
    expect(compile(descriptor, params({ sort: "dispatchDate", order: "sideways" })).orderBy).toEqual(
      [{ dispatchDate: "desc" }],
    );
  });

  it("nests a relation sort path", () => {
    expect(compile(descriptor, params({ sort: "cedula", order: "asc" })).orderBy).toEqual([
      { customer: { cedula: "asc" } },
    ]);
  });
});

describe("R1.6 pagination", () => {
  it("uses the resource default page size", () => {
    const result = compile(descriptor, params({}));
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.skip).toBe(0);
    expect(result.take).toBe(25);
  });

  it("clamps an over-max page size instead of erroring", () => {
    expect(compile(descriptor, params({ pageSize: "5000" })).pageSize).toBe(200);
  });

  it("clamps a non-positive page and page size to their floors", () => {
    const result = compile(descriptor, params({ page: "0", pageSize: "0" }));
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
  });

  it("falls back to the defaults for a non-numeric page and page size", () => {
    const result = compile(descriptor, params({ page: "abc", pageSize: "abc" }));
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it("computes skip from the requested page", () => {
    expect(compile(descriptor, params({ page: "3", pageSize: "10" })).skip).toBe(20);
  });
});

describe("buildListEnvelope", () => {
  it("computes totalPages and never reports fewer than one page", () => {
    expect(buildListEnvelope({ page: 1, pageSize: 25, total: 0 })).toEqual({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    });
    expect(buildListEnvelope({ page: 2, pageSize: 25, total: 51 }).totalPages).toBe(3);
  });

  it("emits the pagination keys in the frozen order", () => {
    expect(Object.keys(buildListEnvelope({ page: 1, pageSize: 25, total: 10 }))).toEqual([
      "page",
      "pageSize",
      "total",
      "totalPages",
    ]);
  });
});

describe("R2.2 allowUnpaginated dual mode", () => {
  const dual = defineListQuery<TestWhere>({
    key: "dual",
    searchFields: ["nombre"],
    filters: [],
    sort: { keys: {}, fallbackOrderBy: [{ nombre: "asc" }] },
    pagination: { defaultPageSize: 25, maxPageSize: 100 },
    allowUnpaginated: true,
  });

  it("reports unpaginated when BOTH page and pageSize are omitted", () => {
    const result = compile(dual, params({ q: "ana" }));
    expect(result.unpaginated).toBe(true);
    expect(result.skip).toBeUndefined();
    expect(result.take).toBeUndefined();
  });

  it("paginates as soon as either param is present", () => {
    expect(compile(dual, params({ page: "2" })).unpaginated).toBe(false);
    expect(compile(dual, params({ pageSize: "10" })).unpaginated).toBe(false);
  });

  it("never reports unpaginated for a descriptor without the flag", () => {
    expect(compile(descriptor, params({})).unpaginated).toBe(false);
  });
});

/**
 * Capabilities added for tasks 10.1 / 10.7. Each one exists because a real route
 * could not be migrated without it, and each reproduces that route's CURRENT
 * behaviour rather than a tidier version of it.
 */
describe("enum coercion (task 10.1 — tarjetas `toCardStatus`)", () => {
  const coercing = defineListQuery<TestWhere>({
    key: "coercing",
    searchFields: [],
    filters: [
      {
        kind: "enum",
        param: "status",
        field: "status",
        values: ["EN_RUTA", "ENTREGADA"],
        coerce: (raw) => (raw.toUpperCase().replace(/[\s-]+/g, "_") === "EN_RUTA" ? "EN_RUTA" : "ENTREGADA"),
      },
    ],
    sort: { keys: {}, fallbackOrderBy: [{ updatedAt: "desc" }] },
    pagination: { defaultPageSize: 25, maxPageSize: 200 },
  });

  it("accepts a legacy spelling the whitelist alone would reject", () => {
    expect(compile(coercing, params({ status: "en-ruta" })).where).toEqual({ status: "EN_RUTA" });
  });

  it("still honours the ALL sentinel before coercing", () => {
    expect(compile(coercing, params({ status: "ALL" })).where).toEqual({});
  });

  it("applies the coerced fallback instead of throwing on an unknown value", () => {
    expect(compile(coercing, params({ status: "NO_EXISTE" })).where).toEqual({
      status: "ENTREGADA",
    });
  });
});

describe('dateRange boundaries "instant" (task 10.1 — tarjetas parseISO)', () => {
  const instant = defineListQuery<TestWhere>({
    key: "instant",
    searchFields: [],
    filters: [
      {
        kind: "dateRange",
        field: "dispatchDate",
        fromParam: "from",
        toParam: "to",
        boundaries: "instant",
      },
    ],
    sort: { keys: {}, fallbackOrderBy: [{ updatedAt: "desc" }] },
    pagination: { defaultPageSize: 25, maxPageSize: 200 },
  });

  it("applies `to` as LOCAL MIDNIGHT, not end of day", () => {
    const { dispatchDate } = compile(instant, params({ from: "2026-08-01", to: "2026-08-31" }))
      .where as { dispatchDate: { gte: Date; lte: Date } };

    expect([dispatchDate.gte.getFullYear(), dispatchDate.gte.getMonth(), dispatchDate.gte.getDate()])
      .toEqual([2026, 7, 1]);
    expect([dispatchDate.lte.getFullYear(), dispatchDate.lte.getMonth(), dispatchDate.lte.getDate()])
      .toEqual([2026, 7, 31]);
    expect([
      dispatchDate.lte.getHours(),
      dispatchDate.lte.getMinutes(),
      dispatchDate.lte.getSeconds(),
      dispatchDate.lte.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });

  it("still supports either bound alone", () => {
    expect(Object.keys((compile(instant, params({ from: "2026-08-01" })).where as {
      dispatchDate: Record<string, unknown>;
    }).dispatchDate)).toEqual(["gte"]);
  });
});

describe("AND composition (task 10.7 — operativo/contacto)", () => {
  const composed = defineListQuery<TestWhere>({
    key: "composed",
    searchFields: ["tc", "customer.cedula"],
    filters: [
      { kind: "enum", param: "status", field: "status", values: ["EN_RUTA"] },
      { kind: "string", param: "provincia", field: "provincia" },
    ],
    sort: { keys: {}, fallbackOrderBy: [{ updatedAt: "desc" }] },
    pagination: { defaultPageSize: 25, maxPageSize: 100 },
  });

  const prefix = [{ status: { notIn: ["ENTREGADA"] } }];
  const suffix = [{ OR: [{ slaDueDate: null }] }];

  it("never lets the compiled search OR overwrite a mandatory OR-shaped clause", () => {
    const { where } = compile(composed, params({ q: "ana", provincia: "SANTIAGO" }), {
      andPrefix: prefix,
      andSuffix: suffix,
    });

    // A FLAT where would have collided: both the search and the SLA window use
    // the top-level `OR` key, and the last writer would silently win.
    expect(Object.keys(where as object)).toEqual(["AND"]);
    expect((where as { AND: unknown[] }).AND).toEqual([
      { status: { notIn: ["ENTREGADA"] } },
      { provincia: "SANTIAGO" },
      {
        OR: [
          { tc: { contains: "ana", mode: "insensitive" } },
          { customer: { cedula: { contains: "ana", mode: "insensitive" } } },
        ],
      },
      { OR: [{ slaDueDate: null }] },
    ]);
  });

  it("keeps the mandatory conjuncts when no filter and no search applies", () => {
    const { where } = compile(composed, params({ status: "ALL", provincia: "ALL" }), {
      andPrefix: prefix,
      andSuffix: suffix,
    });
    expect((where as { AND: unknown[] }).AND).toEqual([...prefix, ...suffix]);
  });

  it("stays flat when no composition options are given", () => {
    expect(compile(composed, params({ provincia: "SANTIAGO" })).where).toEqual({
      provincia: "SANTIAGO",
    });
  });
});
