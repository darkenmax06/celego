import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups — Work Unit D, Task 8. RED against the missing
 * `@/app/api/card-groups/[id]/route` module.
 *
 * Proves `PATCH /api/card-groups/[id]` uses a SINGLE
 * `cardGroupMember.createMany({ skipDuplicates: true })` call for member
 * additions (never an N-upsert loop), reports the `{added, alreadyMember}`
 * arithmetic, and that `removeCardIds` compiles to one `deleteMany` call.
 */
const { groupStore, memberStore, prismaMock } = vi.hoisted(() => {
  const groupStore = new Map<string, Record<string, unknown>>();
  const memberStore = new Map<string, Record<string, unknown>>();

  const prismaMock = {
    cardGroup: {
      findMany: vi.fn(async () => [...groupStore.values()]),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => groupStore.get(where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `group-${groupStore.size + 1}`;
        const now = new Date();
        const group = { id, name: data.name, createdAt: now, updatedAt: now };
        groupStore.set(id, group);
        return group;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const group = groupStore.get(where.id);
        if (!group) throw new Error("not found");
        Object.assign(group, data);
        return group;
      }),
      delete: vi.fn(),
    },
    cardGroupMember: {
      createMany: vi.fn(
        async ({
          data,
          skipDuplicates,
        }: {
          data: { groupId: string; cardId: string; addedById: string }[];
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const entry of data) {
            const key = `${entry.groupId}:${entry.cardId}`;
            if (memberStore.has(key) && skipDuplicates) continue;
            memberStore.set(key, entry);
            count += 1;
          }
          return { count };
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { groupId: string; cardId: { in: string[] } } }) => {
        let count = 0;
        for (const cardId of where.cardId.in) {
          if (memberStore.delete(`${where.groupId}:${cardId}`)) count += 1;
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

import { PATCH } from "@/app/api/card-groups/[id]/route";

function req(body?: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  groupStore.clear();
  memberStore.clear();
  vi.clearAllMocks();
  requireApiSessionMock.mockResolvedValue({ session: { user: { id: "user-1", role: "OPERADOR" } } });
  groupStore.set("group-1", { id: "group-1", name: "Grupo", createdAt: new Date(), updatedAt: new Date() });
});

describe("PATCH /api/card-groups/[id] — bulk membership", () => {
  it("adds new members with exactly one createMany({ skipDuplicates: true }) call", async () => {
    const response = (await PATCH(req({ addCardIds: ["card-1", "card-2", "card-3"] }), {
      params: Promise.resolve({ id: "group-1" }),
    })) as Response;

    expect(response.status).toBe(200);
    expect(prismaMock.cardGroupMember.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.cardGroupMember.createMany).toHaveBeenCalledWith({
      data: [
        { groupId: "group-1", cardId: "card-1", addedById: "user-1" },
        { groupId: "group-1", cardId: "card-2", addedById: "user-1" },
        { groupId: "group-1", cardId: "card-3", addedById: "user-1" },
      ],
      skipDuplicates: true,
    });
    const body = await response.json();
    expect(body.added).toBe(3);
    expect(body.alreadyMember).toBe(0);
  });

  it("reports {added, alreadyMember} when part of the selection is already a member", async () => {
    memberStore.set("group-1:card-1", { groupId: "group-1", cardId: "card-1", addedById: "user-1" });
    memberStore.set("group-1:card-2", { groupId: "group-1", cardId: "card-2", addedById: "user-1" });

    const response = (await PATCH(req({ addCardIds: ["card-1", "card-2", "card-3"] }), {
      params: Promise.resolve({ id: "group-1" }),
    })) as Response;

    const body = await response.json();
    expect(body.added).toBe(1);
    expect(body.alreadyMember).toBe(2);
  });

  it("removes members via a single deleteMany call", async () => {
    memberStore.set("group-1:card-1", { groupId: "group-1", cardId: "card-1", addedById: "user-1" });

    const response = (await PATCH(req({ removeCardIds: ["card-1"] }), {
      params: Promise.resolve({ id: "group-1" }),
    })) as Response;

    expect(response.status).toBe(200);
    expect(prismaMock.cardGroupMember.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.cardGroupMember.deleteMany).toHaveBeenCalledWith({
      where: { groupId: "group-1", cardId: { in: ["card-1"] } },
    });
    const body = await response.json();
    expect(body.removed).toBe(1);
  });

  it("rejects more than 500 addCardIds with 400 and performs no writes", async () => {
    const cardIds = Array.from({ length: 501 }, (_, i) => `card-${i}`);
    const response = (await PATCH(req({ addCardIds: cardIds }), {
      params: Promise.resolve({ id: "group-1" }),
    })) as Response;
    expect(response.status).toBe(400);
    expect(prismaMock.cardGroupMember.createMany).not.toHaveBeenCalled();
  });
});
