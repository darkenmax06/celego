import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups — Stage D.
 *
 * `GET /api/card-groups/[id]/cards` feeds the `/modificacion-masiva` scan
 * table. It is a read, but the screen exists to bulk-mutate cards, so it is
 * gated with the STRICTER of the two gates already in play:
 * `POST /api/tarjetas/lote/estado` and the `/modificacion-masiva` page both
 * require ADMIN/OPERADOR, while `GET /api/card-groups` is deliberately wider.
 *
 * The membership predicate MUST come from `compileCardGroupWhere` — this
 * codebase has already had to de-duplicate a second translation of that
 * relation twice.
 */
const { prismaMock, sessionMock, groupStore, cardStore } = vi.hoisted(() => {
  const groupStore = new Map<string, { id: string; name: string }>();
  const cardStore: Record<string, unknown>[] = [];
  const prismaMock = {
    cardGroup: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => groupStore.get(where.id) ?? null),
    },
    card: {
      count: vi.fn(async (_args: { where: unknown }) => cardStore.length),
      findMany: vi.fn(
        async (args: { where: unknown; select: unknown; take?: number }) =>
          typeof args.take === "number" ? cardStore.slice(0, args.take) : cardStore,
      ),
    },
  };
  const sessionMock = vi.fn(async () => ({ session: { user: { id: "user-1", role: "OPERADOR" } } }));
  return { prismaMock, sessionMock, groupStore, cardStore };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: sessionMock }));

import { GET, CARD_GROUP_LOAD_CAP } from "@/app/api/card-groups/[id]/cards/route";
import { compileCardGroupWhere } from "@/lib/list-query/card-group-where";

function buildCard(index: number) {
  return {
    id: `card-${index}`,
    tc: `400000000000${String(index).padStart(4, "0")}`,
    provincia: "SANTIAGO",
    zona: "Norte",
    isRemote: false,
    status: "EN_RUTA",
    customer: { nombre: `Cliente ${index}`, cedula: `001-0000000-${index}` },
  };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const request = {} as Request;

beforeEach(() => {
  groupStore.clear();
  cardStore.length = 0;
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ session: { user: { id: "user-1", role: "OPERADOR" } } });
  groupStore.set("group-1", { id: "group-1", name: "Grupo A" });
});

describe("GET /api/card-groups/[id]/cards", () => {
  it("returns the group's cards with only the fields the scan table renders", async () => {
    cardStore.push(buildCard(1), buildCard(2));

    const response = (await GET(request, ctx("group-1")))!;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.truncated).toBe(false);
    expect(body.cards).toHaveLength(2);
    expect(Object.keys(body.cards[0]).sort()).toEqual([
      "customer",
      "id",
      "isRemote",
      "provincia",
      "status",
      "tc",
      "zona",
    ]);

    const select = prismaMock.card.findMany.mock.calls[0][0].select;
    expect(select).toEqual({
      id: true,
      tc: true,
      provincia: true,
      zona: true,
      isRemote: true,
      status: true,
      customer: { select: { nombre: true, cedula: true } },
    });
  });

  it("builds the membership predicate from the shared compileCardGroupWhere source", async () => {
    await GET(request, ctx("group-1"));

    const expected = compileCardGroupWhere(new URLSearchParams({ grupo: "group-1" }));
    expect(prismaMock.card.findMany.mock.calls[0][0].where).toEqual(expected);
    expect(prismaMock.card.count.mock.calls[0][0].where).toEqual(expected);
  });

  it("caps the payload and reports the untruncated total instead of hiding it", async () => {
    for (let index = 0; index < CARD_GROUP_LOAD_CAP + 25; index += 1) {
      cardStore.push(buildCard(index));
    }

    const response = (await GET(request, ctx("group-1")))!;
    const body = await response.json();

    expect(prismaMock.card.findMany.mock.calls[0][0].take).toBe(CARD_GROUP_LOAD_CAP);
    expect(body.cards).toHaveLength(CARD_GROUP_LOAD_CAP);
    expect(body.total).toBe(CARD_GROUP_LOAD_CAP + 25);
    expect(body.cap).toBe(CARD_GROUP_LOAD_CAP);
    expect(body.truncated).toBe(true);
  });

  it("returns an empty list for a group with no members", async () => {
    const response = (await GET(request, ctx("group-1")))!;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cards).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.truncated).toBe(false);
  });

  it("returns 404 for an unknown group", async () => {
    const response = (await GET(request, ctx("missing")))!;

    expect(response.status).toBe(404);
    expect(prismaMock.card.findMany).not.toHaveBeenCalled();
  });

  it("is gated to ADMIN/OPERADOR, matching POST /api/tarjetas/lote/estado", async () => {
    await GET(request, ctx("group-1"));
    expect(sessionMock).toHaveBeenCalledWith(["ADMIN", "OPERADOR"]);
  });

  it("propagates the session helper's rejection without touching the database", async () => {
    const { NextResponse } = await import("next/server");
    sessionMock.mockResolvedValue({
      error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }),
    } as never);

    const response = (await GET(request, ctx("group-1")))!;

    expect(response.status).toBe(403);
    expect(prismaMock.cardGroup.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.card.findMany).not.toHaveBeenCalled();
  });
});
