import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups remediation — FIX 2.
 *
 * RED against the missing `@/app/api/tarjetas/off-filter-count/route` module.
 *
 * `tarjetas-client.tsx:302` computed the off-filter count as "selected id not
 * on the loaded PAGE", which is wrong once the operator pages without
 * changing any filter. This endpoint answers the real question — "does this
 * selected card match the active filter" — server-side, reusing the exact
 * same `lib/list-query` compiled `where` the list itself uses (verified below
 * by asserting `prisma.card.count` receives a `status` clause built by the
 * shared `tarjetas` descriptor, not a hand-rolled translation).
 */
const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    card: {
      count: vi.fn(async () => 0),
    },
  };
  return { prismaMock };
});

let currentRole = "OPERADOR";
const requireApiSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: requireApiSessionMock }));

import { POST } from "@/app/api/tarjetas/off-filter-count/route";

function req(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  currentRole = "OPERADOR";
  vi.clearAllMocks();
  prismaMock.card.count.mockResolvedValue(0);
  requireApiSessionMock.mockImplementation(async (allowedRoles: string[]) => {
    if (!allowedRoles.includes(currentRole)) {
      return { error: new Response(null, { status: 403 }) };
    }
    return { session: { user: { id: "user-1", role: currentRole } } };
  });
});

describe("POST /api/tarjetas/off-filter-count", () => {
  it("returns 0 off-filter when every selected id matches the active filter", async () => {
    prismaMock.card.count.mockResolvedValueOnce(3);
    const response = (await POST(
      req({ cardIds: ["c1", "c2", "c3"], filters: { status: "DESPACHADA" } }),
    )) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.offFilterCount).toBe(0);
  });

  it("reports the difference between selected count and filter-matching count", async () => {
    prismaMock.card.count.mockResolvedValueOnce(2);
    const response = (await POST(
      req({ cardIds: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"], filters: {} }),
    )) as Response;
    const body = await response.json();
    expect(body.offFilterCount).toBe(6);
  });

  it("reuses the shared tarjetas compiled where — status reaches Prisma as a real clause", async () => {
    await POST(req({ cardIds: ["c1"], filters: { status: "DESPACHADA" } }));
    const call = prismaMock.card.count.mock.calls[0] as unknown as [{ where: unknown }];
    expect(JSON.stringify(call[0].where)).toContain("DESPACHADA");
  });

  it("rejects more than 500 cardIds with 400 and performs no query", async () => {
    const cardIds = Array.from({ length: 501 }, (_, i) => `card-${i}`);
    const response = (await POST(req({ cardIds, filters: {} }))) as Response;
    expect(response.status).toBe(400);
    expect(prismaMock.card.count).not.toHaveBeenCalled();
  });

  it("rejects an empty cardIds array with 400", async () => {
    const response = (await POST(req({ cardIds: [], filters: {} }))) as Response;
    expect(response.status).toBe(400);
  });

  it.each(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"])(
    "admits role %s (matches GET /api/tarjetas)",
    async (role) => {
      currentRole = role;
      const response = (await POST(req({ cardIds: ["c1"], filters: {} }))) as Response;
      expect(response.status).toBe(200);
    },
  );

  it("returns 401 when there is no session", async () => {
    requireApiSessionMock.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) });
    const response = (await POST(req({ cardIds: ["c1"], filters: {} }))) as Response;
    expect(response.status).toBe(401);
  });

  it("rejects a malformed payload with 400", async () => {
    const response = (await POST(req({ cardIds: "not-an-array" }))) as Response;
    expect(response.status).toBe(400);
  });
});
