/**
 * Task 10.10 fidelity tests.
 *
 * The Phase 9 descriptors were written as a SUPERSET of what the routes accept
 * today. These tests pin the extra encodings `compile()` needs so a descriptor
 * can reproduce its route BYTE FOR BYTE instead of quietly widening the public
 * API. Every expectation below was transcribed from a direct read of the route
 * handler named in its describe block.
 */
import { describe, expect, it } from "vitest";
import { compile, defineListQuery } from "../../lib/list-query";

type TestWhere = Record<string, unknown>;

function params(init: Record<string, string> = {}) {
  return new URLSearchParams(init);
}

const noSort = { keys: {}, fallbackOrderBy: [{ createdAt: "desc" }] } as const;
const pagination = { defaultPageSize: 20, maxPageSize: 100 } as const;

describe("single-day filter (rutas, lotes, redacciones)", () => {
  // `const start = new Date(date); const end = new Date(start);
  //  end.setDate(end.getDate() + 1); where.fecha = { gte: start, lt: end };`
  const descriptor = defineListQuery<TestWhere>({
    key: "day",
    searchFields: [],
    filters: [{ kind: "day", param: "date", field: "fecha" }],
    sort: noSort,
    pagination,
  });

  it("expands a single date param into a half-open [start, start + 1 day) range", () => {
    const { where } = compile(descriptor, params({ date: "2026-03-10" }));
    const start = new Date("2026-03-10");
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    expect(where.fecha).toEqual({ gte: start, lt: end });
  });

  it("applies no constraint when the param is absent or blank", () => {
    expect(compile(descriptor, params({})).where).toEqual({});
    expect(compile(descriptor, params({ date: "  " })).where).toEqual({});
  });

  it("ignores an unparseable date exactly as the routes do", () => {
    expect(compile(descriptor, params({ date: "no-es-fecha" })).where).toEqual({});
  });
});

describe("truthy-only boolean (tarjetas urgent, mensajeros onlyActive)", () => {
  // `const onlyActive = searchParams.get("onlyActive") === "1"` — "0" is IGNORED,
  // it does NOT mean `activo: false`.
  const descriptor = defineListQuery<TestWhere>({
    key: "truthy",
    searchFields: [],
    filters: [{ kind: "boolean", param: "onlyActive", field: "activo", truthyOnly: true }],
    sort: noSort,
    pagination,
  });

  it("applies the constraint only for \"1\"", () => {
    expect(compile(descriptor, params({ onlyActive: "1" })).where).toEqual({ activo: true });
  });

  it("treats \"0\" as absent instead of filtering for false", () => {
    expect(compile(descriptor, params({ onlyActive: "0" })).where).toEqual({});
  });
});

describe("literal boolean encoding (config/usuarios active)", () => {
  // `active === "true" ? { active: true } : active === "false" ? { active: false } : {}`
  const descriptor = defineListQuery<TestWhere>({
    key: "literal",
    searchFields: [],
    filters: [{ kind: "boolean", param: "active", field: "active", encoding: "literal" }],
    sort: noSort,
    pagination,
  });

  it("accepts \"true\" and \"false\"", () => {
    expect(compile(descriptor, params({ active: "true" })).where).toEqual({ active: true });
    expect(compile(descriptor, params({ active: "false" })).where).toEqual({ active: false });
  });

  it("rejects the binary encoding this route never accepted", () => {
    expect(compile(descriptor, params({ active: "1" })).where).toEqual({});
    expect(compile(descriptor, params({ active: "0" })).where).toEqual({});
  });
});

describe("enum drop-invalid (config/usuarios role)", () => {
  // `role !== "ALL" && Object.values(UserRole).includes(role) ? { role } : {}`
  const descriptor = defineListQuery<TestWhere>({
    key: "drop",
    searchFields: [],
    filters: [
      { kind: "enum", param: "role", field: "role", values: ["ADMIN", "OPERADOR"], onInvalid: "drop" },
    ],
    sort: noSort,
    pagination,
  });

  it("silently drops an unknown value instead of throwing", () => {
    expect(compile(descriptor, params({ role: "SUPERUSER" })).where).toEqual({});
  });

  it("still applies a whitelisted value", () => {
    expect(compile(descriptor, params({ role: "ADMIN" })).where).toEqual({ role: "ADMIN" });
  });
});

describe("string filter without the ALL sentinel (actividad action/result)", () => {
  // The actividad route applies any non-empty `action`; it has no sentinel.
  const descriptor = defineListQuery<TestWhere>({
    key: "no-sentinel",
    searchFields: [],
    filters: [{ kind: "string", param: "action", field: "action", sentinel: false }],
    sort: noSort,
    pagination,
  });

  it("queries the literal value \"ALL\" when the route has no sentinel", () => {
    expect(compile(descriptor, params({ action: "ALL" })).where).toEqual({ action: "ALL" });
  });

  it("still treats blank as absent", () => {
    expect(compile(descriptor, params({ action: "  " })).where).toEqual({});
  });
});

describe("case-insensitive string filter (mensajeros province)", () => {
  // `provinciaTrabajo: { equals: province, mode: "insensitive" }`
  const descriptor = defineListQuery<TestWhere>({
    key: "insensitive",
    searchFields: [],
    filters: [
      { kind: "string", param: "province", field: "provinciaTrabajo", insensitive: true },
    ],
    sort: noSort,
    pagination,
  });

  it("emits the equals/mode form rather than a bare scalar", () => {
    expect(compile(descriptor, params({ province: "Santiago" })).where).toEqual({
      provinciaTrabajo: { equals: "Santiago", mode: "insensitive" },
    });
  });
});

describe("local-day date boundaries (actividad from/to)", () => {
  // `gte: new Date(`${from}T00:00:00`)` / `lte: new Date(`${to}T23:59:59.999`)`
  const descriptor = defineListQuery<TestWhere>({
    key: "local",
    searchFields: [],
    filters: [
      {
        kind: "dateRange",
        field: "createdAt",
        fromParam: "from",
        toParam: "to",
        boundaries: "localDay",
      },
    ],
    sort: noSort,
    pagination,
  });

  it("uses local midnight and local end-of-day, not UTC", () => {
    const { where } = compile(descriptor, params({ from: "2026-03-10", to: "2026-03-12" }));
    expect(where.createdAt).toEqual({
      gte: new Date("2026-03-10T00:00:00"),
      lte: new Date("2026-03-12T23:59:59.999"),
    });
  });
});

describe("default encodings are unchanged", () => {
  const descriptor = defineListQuery<TestWhere>({
    key: "defaults",
    searchFields: [],
    filters: [
      { kind: "boolean", param: "remote", field: "isRemote" },
      { kind: "string", param: "zona", field: "zona" },
      { kind: "dateRange", field: "fecha", fromParam: "from", toParam: "to" },
    ],
    sort: noSort,
    pagination,
  });

  it("keeps binary booleans, the ALL sentinel and UTC day boundaries by default", () => {
    expect(compile(descriptor, params({ remote: "0" })).where).toEqual({ isRemote: false });
    expect(compile(descriptor, params({ zona: "ALL" })).where).toEqual({});
    expect(compile(descriptor, params({ from: "2026-03-10" })).where).toEqual({
      fecha: { gte: new Date("2026-03-10T00:00:00.000Z") },
    });
  });
});
