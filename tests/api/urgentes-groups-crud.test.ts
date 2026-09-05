import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups — Work Unit A, Task 1.
 *
 * Characterization tests for the CURRENT `app/api/urgentes/groups/**` CRUD,
 * written BEFORE any relocation or hardening. These document today's real
 * behaviour, including the known 500-on-duplicate-name bug — that bug is NOT
 * fixed here, only proven to exist so the relocation (Work Unit D) can prove
 * it is fixed at the new location without losing coverage of anything else.
 */
const { groupStore, memberStore, prismaMock } = vi.hoisted(() => {
  const groupStore = new Map<string, Record<string, unknown>>();
  const memberStore = new Map<string, Record<string, unknown>>();

  function countMembers(groupId: string): number {
    return [...memberStore.values()].filter((m) => m.groupId === groupId).length;
  }

  const prismaMock = {
    cardGroup: {
      findMany: vi.fn(async () => {
        return [...groupStore.values()]
          .sort((a, b) => (b.updatedAt as Date).getTime() - (a.updatedAt as Date).getTime())
          .map((g) => ({ ...g, _count: { members: countMembers(g.id as string) } }));
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const group = groupStore.get(where.id);
        if (!group) return null;
        return {
          ...group,
          members: [...memberStore.values()].filter((m) => m.groupId === where.id),
        };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const existing = [...groupStore.values()].find((g) => g.name === data.name);
        if (existing) {
          const error = new Error("Unique constraint failed") as Error & { code: string };
          error.code = "P2002";
          throw error;
        }
        const id = `group-${groupStore.size + 1}`;
        const now = new Date();
        const group = { id, name: data.name, createdById: data.createdById, createdAt: now, updatedAt: now };
        groupStore.set(id, group);
        const membersInput = data.members as { create?: { cardId: string; addedById: string }[] } | undefined;
        const created = (membersInput?.create ?? []).map((m, i) => ({
          groupId: id,
          cardId: m.cardId,
          addedById: m.addedById,
          addedAt: new Date(),
        }));
        for (const m of created) memberStore.set(`${m.groupId}:${m.cardId}`, m);
        return { ...group, members: created };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { name?: string } }) => {
        const group = groupStore.get(where.id);
        if (!group) throw new Error("not found");
        if (data.name) {
          const dup = [...groupStore.values()].find((g) => g.name === data.name && g.id !== where.id);
          if (dup) {
            const error = new Error("Unique constraint failed") as Error & { code: string };
            error.code = "P2002";
            throw error;
          }
          group.name = data.name;
        }
        group.updatedAt = new Date();
        return group;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const group = groupStore.get(where.id);
        if (!group) {
          const error = new Error("Record not found") as Error & { code: string };
          error.code = "P2025";
          throw error;
        }
        groupStore.delete(where.id);
        for (const key of [...memberStore.keys()]) {
          if (key.startsWith(`${where.id}:`)) memberStore.delete(key);
        }
        return group;
      }),
    },
    cardGroupMember: {
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { groupId_cardId: { groupId: string; cardId: string } };
          create: { groupId: string; cardId: string; addedById: string };
        }) => {
          const key = `${where.groupId_cardId.groupId}:${where.groupId_cardId.cardId}`;
          if (!memberStore.has(key)) {
            memberStore.set(key, { ...create, addedAt: new Date() });
          }
          return memberStore.get(key);
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { groupId: string; cardId: { in: string[] } } }) => {
        let count = 0;
        for (const cardId of where.cardId.in) {
          const key = `${where.groupId}:${cardId}`;
          if (memberStore.delete(key)) count += 1;
        }
        return { count };
      }),
    },
  };

  return { groupStore, memberStore, prismaMock };
});

const requireApiSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: requireApiSessionMock }));

import { GET, POST } from "@/app/api/urgentes/groups/route";
import { PATCH, DELETE } from "@/app/api/urgentes/groups/[id]/route";

function req(body?: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function forbidden() {
  return { error: { status: 403 } as unknown as Response };
}

function allow(userId = "user-1") {
  requireApiSessionMock.mockResolvedValue({ session: { user: { id: userId } } });
}

beforeEach(() => {
  groupStore.clear();
  memberStore.clear();
  vi.clearAllMocks();
});

describe("GET /api/urgentes/groups (characterization)", () => {
  it("returns groups ordered by updatedAt desc with member counts", async () => {
    allow();
    await POST(req({ name: "Grupo A", cardIds: ["card-1", "card-2"] }));
    await POST(req({ name: "Grupo B", cardIds: ["card-3"] }));

    const response = (await GET()) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groups).toHaveLength(2);
    expect(body.groups[0].name).toBe("Grupo B");
    expect(body.groups[0]._count.members).toBe(1);
  });

  it("denies a role outside ADMIN/OPERADOR", async () => {
    requireApiSessionMock.mockResolvedValue(forbidden());
    const response = await GET();
    expect(response).toEqual(forbidden().error);
  });
});

describe("POST /api/urgentes/groups (characterization)", () => {
  it("creates a group with members", async () => {
    allow();
    const response = (await POST(req({ name: "Rechazos BHD", cardIds: ["card-1"] }))) as Response;
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.group.name).toBe("Rechazos BHD");
    expect(body.group.members).toHaveLength(1);
  });

  it("rejects an empty cardIds array with 400 (min(1) today)", async () => {
    allow();
    const response = (await POST(req({ name: "Vacio", cardIds: [] }))) as Response;
    expect(response.status).toBe(400);
  });

  it("rejects a missing/empty name with 400", async () => {
    allow();
    const response = (await POST(req({ name: "", cardIds: ["card-1"] }))) as Response;
    expect(response.status).toBe(400);
  });

  it("BUG: a duplicate name throws unhandled and surfaces as a 500 (not fixed here)", async () => {
    allow();
    await POST(req({ name: "Duplicado", cardIds: ["card-1"] }));
    await expect(POST(req({ name: "Duplicado", cardIds: ["card-2"] }))).rejects.toThrow(
      "Unique constraint failed",
    );
  });
});

describe("PATCH /api/urgentes/groups/[id] (characterization)", () => {
  async function createGroup(name: string, cardIds: string[]) {
    const response = (await POST(req({ name, cardIds }))) as Response;
    const body = await response.json();
    return body.group.id as string;
  }

  it("renames a group", async () => {
    allow();
    const id = await createGroup("Original", ["card-1"]);
    const response = (await PATCH(req({ name: "Renombrado" }), {
      params: Promise.resolve({ id }),
    })) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.group.name).toBe("Renombrado");
  });

  it("adds and removes members via upsert/deleteMany", async () => {
    allow();
    const id = await createGroup("Miembros", ["card-1"]);
    const response = (await PATCH(req({ addCardIds: ["card-2"], removeCardIds: ["card-1"] }), {
      params: Promise.resolve({ id }),
    })) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    const cardIds = (body.group.members as { cardId: string }[]).map((m) => m.cardId);
    expect(cardIds).toEqual(["card-2"]);
  });

  it("returns 404 when the group does not exist", async () => {
    allow();
    const response = (await PATCH(req({ name: "X" }), {
      params: Promise.resolve({ id: "missing" }),
    })) as Response;
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/urgentes/groups/[id] (characterization)", () => {
  it("deletes an existing group", async () => {
    allow();
    const created = (await POST(req({ name: "Borrar", cardIds: ["card-1"] }))) as Response;
    const body = await created.json();
    const response = (await DELETE(req(), { params: Promise.resolve({ id: body.group.id }) })) as Response;
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.ok).toBe(true);
  });

  it("BUG: deleting a missing group throws unhandled (P2025, not fixed here)", async () => {
    allow();
    await expect(DELETE(req(), { params: Promise.resolve({ id: "missing" }) })).rejects.toThrow(
      "Record not found",
    );
  });
});
