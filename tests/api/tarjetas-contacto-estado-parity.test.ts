import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups remediation — dedupe `contactoEstado` filter composition.
 *
 * `contactoEstado` is not a `list-query` filter kind (it reads a JSON
 * `metadata` path), so both `GET /api/tarjetas` and `compileTarjetasWhere`
 * (used by `POST /api/tarjetas/off-filter-count`) used to compose it by hand,
 * byte-for-byte identically. That duplication could silently drift: if
 * someone updated one copy and forgot the other, the off-filter count would
 * lie about which cards match the active filter — a safety warning that
 * lies is worse than none.
 *
 * This test proves the list route's `where` and `compileTarjetasWhere`'s
 * `where` are identical for every `contactoEstado` value, guarding against
 * that duplication ever coming back.
 */
const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    card: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  };
  return { prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "user-1", role: "ADMIN" } },
  })),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/tarjetas/route";
import { compileTarjetasWhere } from "@/lib/list-query/tarjetas-where";

function req(searchParams: string): NextRequest {
  return { nextUrl: { searchParams: new URLSearchParams(searchParams) } } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.card.findMany.mockResolvedValue([]);
  prismaMock.card.count.mockResolvedValue(0);
});

describe("GET /api/tarjetas and compileTarjetasWhere agree on contactoEstado", () => {
  it.each([
    undefined,
    "ALL",
    "CONTACTADA",
    "RETORNO_SOLICITADO",
    "TRASLADO_SOLICITADO",
    "NO_CONTACTADA",
  ])("produces the same where for contactoEstado=%s", async (value) => {
    const qs = value === undefined ? "" : `contactoEstado=${value}`;
    await GET(req(qs));

    const call = prismaMock.card.findMany.mock.calls[0] as unknown as [{ where: unknown }];
    const routeWhere = call[0].where;

    const params = new URLSearchParams(qs);
    const { where: helperWhere } = compileTarjetasWhere(params);

    expect(JSON.stringify(routeWhere)).toBe(JSON.stringify(helperWhere));
  });
});
