import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups — "Grupo" filter on `/operativo` and `/sla-vencidas`.
 *
 * Both routes must translate the `grupo` search param into the SAME
 * `Prisma.CardWhereInput` shape that `relationSome` already produces for
 * `/tarjetas`, including multi-select OR semantics and the `SIN_GRUPO` token.
 * `/sla-vencidas` gets there through `compile()`; `/operativo` builds its
 * `where` by hand in three tab branches and therefore goes through the shared
 * `compileCardGroupWhere` helper. These tests are the proof that the two paths
 * cannot drift apart.
 */
const { capturedCardWhere, prismaMock } = vi.hoisted(() => {
  const capturedCardWhere: unknown[] = [];
  const prismaMock = {
    card: {
      findMany: vi.fn(async ({ where }: { where?: unknown }) => {
        capturedCardWhere.push(where);
        return [];
      }),
      count: vi.fn(async () => 0),
    },
    urgentCase: {
      findMany: vi.fn(async () => []),
    },
    messenger: {
      findMany: vi.fn(async () => []),
    },
  };
  return { capturedCardWhere, prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "user-1" } },
  })),
}));
vi.mock("@/lib/urgent-alerts", () => ({
  emitDueUrgentNotifications: vi.fn(async () => undefined),
  clampUrgencyLevel: (value: unknown) => value,
  urgencyIntervalMinutes: () => 60,
  urgencyLevelLabel: () => "",
}));

import { GET as operativoGET } from "@/app/api/operativo/contacto/route";
import { GET as slaGET } from "@/app/api/sla-vencidas/route";
import { compileCardGroupWhere } from "@/lib/list-query/card-group-where";
import { compile } from "@/lib/list-query";
import { tarjetasListQuery } from "@/lib/list-query/descriptors/tarjetas";

/** Minimal `NextRequest` stand-in: both handlers only read `nextUrl.searchParams`. */
function req(path: string, query: string) {
  const url = new URL(`http://localhost${path}${query ? `?${query}` : ""}`);
  return { nextUrl: url, url: url.toString() } as never;
}

/** Deep search for a group clause anywhere inside a composed `where`. */
function collectGroupClauses(node: unknown, found: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) collectGroupClauses(item, found);
    return found;
  }
  const record = node as Record<string, unknown>;
  if ("groupMemberships" in record) found.push(record);
  for (const value of Object.values(record)) collectGroupClauses(value, found);
  return found;
}

/** The clause the compiled `/tarjetas` path produces for the same raw value. */
function tarjetasGroupClause(raw: string): unknown[] {
  const params = new URLSearchParams();
  params.set("grupo", raw);
  return collectGroupClauses(compile(tarjetasListQuery, params).where);
}

const OPERATIVO_TABS = ["activos", "contactadas", "urgentes"] as const;

beforeEach(() => {
  capturedCardWhere.length = 0;
  vi.clearAllMocks();
});

describe("compileCardGroupWhere — shared group predicate", () => {
  it("returns undefined when the param is absent or ALL", () => {
    expect(compileCardGroupWhere(new URLSearchParams())).toBeUndefined();
    expect(compileCardGroupWhere(new URLSearchParams("grupo=ALL"))).toBeUndefined();
    expect(compileCardGroupWhere(new URLSearchParams("grupo="))).toBeUndefined();
  });

  it("produces exactly the clause the /tarjetas compiler produces", () => {
    for (const raw of ["g1", "g1,g2", "SIN_GRUPO", "SIN_GRUPO,g1", "g1,g2,SIN_GRUPO"]) {
      const params = new URLSearchParams();
      params.set("grupo", raw);
      expect(collectGroupClauses(compileCardGroupWhere(params))).toEqual(tarjetasGroupClause(raw));
    }
  });

  it("uses OR (not AND) across multiple group ids", () => {
    expect(compileCardGroupWhere(new URLSearchParams("grupo=g1,g2"))).toEqual({
      groupMemberships: { some: { groupId: { in: ["g1", "g2"] } } },
    });
  });

  it("maps SIN_GRUPO alone to a none clause", () => {
    expect(compileCardGroupWhere(new URLSearchParams("grupo=SIN_GRUPO"))).toEqual({
      groupMemberships: { none: {} },
    });
  });

  it("ORs SIN_GRUPO together with a real group id", () => {
    expect(compileCardGroupWhere(new URLSearchParams("grupo=SIN_GRUPO,g1"))).toEqual({
      OR: [
        { groupMemberships: { some: { groupId: "g1" } } },
        { groupMemberships: { none: {} } },
      ],
    });
  });
});

describe("GET /api/sla-vencidas — grupo filter", () => {
  it("adds no group constraint when the param is absent", async () => {
    await slaGET(req("/api/sla-vencidas", ""));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([]);
  });

  it("filters by a single group", async () => {
    await slaGET(req("/api/sla-vencidas", "grupo=g1"));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([
      { groupMemberships: { some: { groupId: "g1" } } },
    ]);
  });

  it("filters by multiple groups with OR semantics", async () => {
    await slaGET(req("/api/sla-vencidas", "grupo=g1,g2"));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([
      { groupMemberships: { some: { groupId: { in: ["g1", "g2"] } } } },
    ]);
  });

  it("filters by SIN_GRUPO alone", async () => {
    await slaGET(req("/api/sla-vencidas", "grupo=SIN_GRUPO"));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([{ groupMemberships: { none: {} } }]);
  });

  it("filters by SIN_GRUPO mixed with a real group id", async () => {
    await slaGET(req("/api/sla-vencidas", "grupo=SIN_GRUPO,g1"));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([
      { groupMemberships: { some: { groupId: "g1" } } },
      { groupMemberships: { none: {} } },
    ]);
  });
});

describe("GET /api/operativo/contacto — grupo filter", () => {
  it.each(OPERATIVO_TABS)("adds no group constraint on tab %s when absent", async (tab) => {
    await operativoGET(req("/api/operativo/contacto", `tab=${tab}`));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([]);
  });

  it.each(OPERATIVO_TABS)("filters tab %s by a single group", async (tab) => {
    await operativoGET(req("/api/operativo/contacto", `tab=${tab}&grupo=g1`));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([
      { groupMemberships: { some: { groupId: "g1" } } },
    ]);
  });

  it.each(OPERATIVO_TABS)("filters tab %s by multiple groups with OR semantics", async (tab) => {
    await operativoGET(req("/api/operativo/contacto", `tab=${tab}&grupo=g1,g2`));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([
      { groupMemberships: { some: { groupId: { in: ["g1", "g2"] } } } },
    ]);
  });

  it.each(OPERATIVO_TABS)("filters tab %s by SIN_GRUPO alone", async (tab) => {
    await operativoGET(req("/api/operativo/contacto", `tab=${tab}&grupo=SIN_GRUPO`));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([{ groupMemberships: { none: {} } }]);
  });

  it.each(OPERATIVO_TABS)("filters tab %s by SIN_GRUPO mixed with a group id", async (tab) => {
    await operativoGET(req("/api/operativo/contacto", `tab=${tab}&grupo=SIN_GRUPO,g1`));
    expect(collectGroupClauses(capturedCardWhere[0])).toEqual([
      { groupMemberships: { some: { groupId: "g1" } } },
      { groupMemberships: { none: {} } },
    ]);
  });
});
