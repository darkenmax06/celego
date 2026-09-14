import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resource-generic off-filter-count endpoint.
 *
 * `POST /api/list-query/off-filter-count` answers "how many of these selected
 * card ids do NOT match the active filter" for any registered card-backed
 * resource. Two things silently under-report if they are dropped:
 *
 *  - `RESOURCE_SECURITY[resource].baseWhere()` — `/sla-vencidas` is defined
 *    almost entirely by it, so the compiled descriptor `where` alone is not
 *    the full predicate.
 *  - `/tarjetas` composes a non-descriptor `contactoEstado` constraint that
 *    `compile()` knows nothing about.
 *
 * The legacy `/api/tarjetas/off-filter-count` route now delegates to the same
 * `lib/list-query/off-filter-count` predicate, so these tests also pin that
 * the two entry points cannot produce different answers.
 */
const { capturedCountWhere, capturedRoles, prismaMock, state } = vi.hoisted(() => {
  const capturedCountWhere: unknown[] = [];
  const capturedRoles: unknown[] = [];
  const state = { matching: 0 };
  const prismaMock = {
    card: {
      count: vi.fn(async ({ where }: { where?: unknown }) => {
        capturedCountWhere.push(where);
        return state.matching;
      }),
    },
  };
  return { capturedCountWhere, capturedRoles, prismaMock, state };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async (roles?: unknown) => {
    capturedRoles.push(roles);
    return { session: { user: { id: "user-1", role: "ADMIN" } } };
  }),
}));

import { POST as genericRoute } from "@/app/api/list-query/off-filter-count/route";
import { POST as tarjetasRoute } from "@/app/api/tarjetas/off-filter-count/route";
import { compileOffFilterWhere } from "@/lib/list-query/off-filter-count";
import { compileTarjetasWhere } from "@/lib/list-query/tarjetas-where";
import { RESOURCE_SECURITY } from "@/lib/list-query/security";

/** The route handlers, narrowed to the `Response` they actually always return. */
type PostHandler = (request: Request) => Promise<Response>;
const genericPOST = genericRoute as PostHandler;
const tarjetasPOST = tarjetasRoute as PostHandler;

function post(body: unknown): Request {
  return new Request("http://localhost/api/list-query/off-filter-count", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Deep search for a node carrying the given key anywhere inside a `where`. */
function collectByKey(node: unknown, key: string, found: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) collectByKey(item, key, found);
    return found;
  }
  const record = node as Record<string, unknown>;
  if (key in record) found.push(record);
  for (const value of Object.values(record)) collectByKey(value, key, found);
  return found;
}

beforeEach(() => {
  capturedCountWhere.length = 0;
  capturedRoles.length = 0;
  state.matching = 0;
  vi.clearAllMocks();
});

describe("compileOffFilterWhere — the single place that decides the predicate", () => {
  it("reproduces the /tarjetas predicate exactly, contactoEstado included", () => {
    for (const query of [
      "",
      "status=EN_RUTA",
      "contactoEstado=CONTACTADA",
      "contactoEstado=NO_CONTACTADA&provincia=SANTO+DOMINGO",
      "contactoEstado=TRASLADO_SOLICITADO",
      "contactoEstado=RETORNO_SOLICITADO",
      "contactoEstado=ALL",
      "grupo=g1,SIN_GRUPO",
    ]) {
      const params = new URLSearchParams(query);
      expect(compileOffFilterWhere("tarjetas", params)).toEqual(
        compileTarjetasWhere(params).where,
      );
    }
  });

  it("applies the sla-vencidas baseWhere on top of the compiled descriptor", () => {
    const where = compileOffFilterWhere("sla-vencidas", new URLSearchParams("provincia=AZUA"));

    const expectedBase = RESOURCE_SECURITY["sla-vencidas"].baseWhere?.();
    expect(collectByKey(where, "slaDueDate").length).toBeGreaterThan(0);
    expect(JSON.stringify(where)).toContain(JSON.stringify(expectedBase?.slaDueDate));
  });

  it("rejects an unknown resource", () => {
    expect(() => compileOffFilterWhere("no-such-resource", new URLSearchParams())).toThrow();
  });
});

describe("POST /api/list-query/off-filter-count", () => {
  it("counts the selected ids that do not match the tarjetas filter", async () => {
    state.matching = 2;
    const response = await genericPOST(
      post({ resource: "tarjetas", cardIds: ["a", "b", "c"], filters: { status: "EN_RUTA" } }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.offFilterCount).toBe(1);
  });

  it("constrains the count to exactly the submitted ids", async () => {
    await genericPOST(post({ resource: "tarjetas", cardIds: ["a", "b"] }));

    expect(collectByKey(capturedCountWhere[0], "id")).toContainEqual({
      id: { in: ["a", "b"] },
    });
  });

  it("includes the sla-vencidas baseWhere in the counted predicate", async () => {
    await genericPOST(post({ resource: "sla-vencidas", cardIds: ["a"] }));

    expect(collectByKey(capturedCountWhere[0], "slaDueDate").length).toBeGreaterThan(0);
  });

  it("includes the tarjetas contactoEstado constraint in the counted predicate", async () => {
    await genericPOST(
      post({
        resource: "tarjetas",
        cardIds: ["a"],
        filters: { contactoEstado: "CONTACTADA" },
      }),
    );

    expect(collectByKey(capturedCountWhere[0], "metadata").length).toBeGreaterThan(0);
  });

  it("gates on the roles declared for the requested resource", async () => {
    await genericPOST(post({ resource: "sla-vencidas", cardIds: ["a"] }));

    expect(capturedRoles[0]).toEqual([...RESOURCE_SECURITY["sla-vencidas"].allowedRoles]);
  });

  it("rejects a resource that has no off-filter-count support", async () => {
    const response = await genericPOST(post({ resource: "operativo-contacto", cardIds: ["a"] }));

    expect(response.status).toBe(404);
    expect(prismaMock.card.count).not.toHaveBeenCalled();
  });

  it("rejects an unknown resource", async () => {
    const response = await genericPOST(post({ resource: "nope", cardIds: ["a"] }));

    expect(response.status).toBe(404);
  });

  it("rejects an empty id list without querying", async () => {
    const response = await genericPOST(post({ resource: "tarjetas", cardIds: [] }));

    expect(response.status).toBe(400);
    expect(prismaMock.card.count).not.toHaveBeenCalled();
  });

  it("rejects more than 500 ids without querying", async () => {
    const cardIds = Array.from({ length: 501 }, (_, index) => `card-${index}`);
    const response = await genericPOST(post({ resource: "tarjetas", cardIds }));

    expect(response.status).toBe(400);
    expect(prismaMock.card.count).not.toHaveBeenCalled();
  });

  it("accepts exactly 500 ids", async () => {
    const cardIds = Array.from({ length: 500 }, (_, index) => `card-${index}`);
    const response = await genericPOST(post({ resource: "tarjetas", cardIds }));

    expect(response.status).toBe(200);
  });
});

describe("POST /api/tarjetas/off-filter-count stays behaviourally identical", () => {
  it("produces the same predicate as the generic endpoint for the same filters", async () => {
    const filters = { status: "EN_RUTA", contactoEstado: "CONTACTADA" };
    const cardIds = ["a", "b", "c"];

    await tarjetasPOST(post({ cardIds, filters }));
    await genericPOST(post({ resource: "tarjetas", cardIds, filters }));

    expect(capturedCountWhere).toHaveLength(2);
    expect(capturedCountWhere[0]).toEqual(capturedCountWhere[1]);
  });

  it("still reports the off-filter count and keeps its 500-id cap", async () => {
    state.matching = 1;
    const ok = await tarjetasPOST(post({ cardIds: ["a", "b"] }));
    expect(await ok.json()).toEqual({ offFilterCount: 1 });

    const tooMany = await tarjetasPOST(
      post({ cardIds: Array.from({ length: 501 }, (_, i) => `c-${i}`) }),
    );
    expect(tooMany.status).toBe(400);
  });
});
