import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups — Work Unit D, Task 7.
 *
 * RED against the missing `@/app/api/card-groups/route` module: relocating and
 * hardening `app/api/urgentes/groups/**` -> `app/api/card-groups/**`.
 *
 * Supersedes EVERY assertion in `tests/api/urgentes-groups-crud.test.ts`
 * (characterization, Work Unit A) plus the hardening the design mandates:
 *   - "returns groups ordered by updatedAt desc with member counts"
 *     -> "GET returns groups ordered by updatedAt desc with member counts"
 *   - "denies a role outside ADMIN/OPERADOR" (GET)
 *     -> GET role matrix: ADMIN/OPERADOR/FACTURACION/MENSAJERO all admitted
 *        (widened per spec — GET must match `/api/tarjetas`)
 *   - "creates a group with members"
 *     -> "POST creates a group with members, 201"
 *   - "rejects an empty cardIds array with 400 (min(1) today)"
 *     -> SUPERSEDED, not reproduced: the design relaxes `cardIds` to
 *        `.default([])`, so an empty/absent array is now ACCEPTED (201, zero
 *        members). Covered by "defaults cardIds to [] when omitted".
 *   - "rejects a missing/empty name with 400" -> "POST rejects an empty name with 400"
 *   - "BUG: a duplicate name throws unhandled and surfaces as a 500"
 *     -> FIXED here: "POST returns 409 on a duplicate name instead of throwing"
 *   - "renames a group" -> "PATCH renames a group"
 *   - "adds and removes members via upsert/deleteMany"
 *     -> superseded by `card-groups-bulk.test.ts` (createMany, not upsert-loop)
 *   - "returns 404 when the group does not exist" (PATCH) -> reproduced verbatim
 *   - "deletes an existing group" -> "DELETE deletes an existing group"
 *   - "BUG: deleting a missing group throws unhandled (P2025)"
 *     -> FIXED here: "DELETE returns 404 for a missing group instead of throwing"
 *   - POST/PATCH role denial for MENSAJERO -> "write role matrix" below (403)
 */
const { groupStore, memberStore, prismaMock } = vi.hoisted(() => {
  const groupStore = new Map<string, Record<string, unknown>>();
  const memberStore = new Map<string, Record<string, unknown>>();

  function countMembers(groupId: string): number {
    return [...memberStore.values()].filter((m) => m.groupId === groupId).length;
  }

  function findByName(name: string, excludeId?: string) {
    return [...groupStore.values()].find((g) => g.name === name && g.id !== excludeId);
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
        return { ...group, _count: { members: countMembers(where.id) } };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (findByName(data.name as string)) {
          const error = new Error("Unique constraint failed") as Error & { code: string };
          error.code = "P2002";
          throw error;
        }
        const id = `group-${groupStore.size + 1}`;
        const now = new Date();
        const group = { id, name: data.name, createdById: data.createdById, createdAt: now, updatedAt: now };
        groupStore.set(id, group);
        return group;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { name?: string } }) => {
        const group = groupStore.get(where.id);
        if (!group) throw new Error("not found");
        if (data.name) {
          if (findByName(data.name, where.id)) {
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
            if (memberStore.has(key)) {
              if (skipDuplicates) continue;
            }
            memberStore.set(key, { ...entry, addedAt: new Date() });
            count += 1;
          }
          return { count };
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

let currentRole = "ADMIN";
const requireApiSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: requireApiSessionMock }));

import { GET, POST } from "@/app/api/card-groups/route";
import { PATCH, DELETE } from "@/app/api/card-groups/[id]/route";

function req(body?: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function setRole(role: string) {
  currentRole = role;
}

beforeEach(() => {
  groupStore.clear();
  memberStore.clear();
  currentRole = "ADMIN";
  vi.clearAllMocks();
  requireApiSessionMock.mockImplementation(async (allowedRoles: string[]) => {
    if (!allowedRoles.includes(currentRole)) {
      return { error: new Response(null, { status: 403 }) };
    }
    return { session: { user: { id: "user-1", role: currentRole } } };
  });
});

describe("GET /api/card-groups", () => {
  it("returns groups ordered by updatedAt desc with member counts", async () => {
    await POST(req({ name: "Grupo A", cardIds: ["card-1", "card-2"] }));
    await POST(req({ name: "Grupo B", cardIds: ["card-3"] }));

    const response = (await GET()) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groups).toHaveLength(2);
    expect(body.groups[0].name).toBe("Grupo B");
    expect(body.groups[0]._count.members).toBe(1);
  });

  it.each(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"])(
    "admits role %s (widened GET, matches /api/tarjetas)",
    async (role) => {
      setRole(role);
      const response = (await GET()) as Response;
      expect(response.status).toBe(200);
    },
  );
});

describe("POST /api/card-groups", () => {
  it("creates a group with members, 201", async () => {
    const response = (await POST(req({ name: "Rechazos BHD", cardIds: ["card-1"] }))) as Response;
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.group.name).toBe("Rechazos BHD");
    expect(body.added).toBe(1);
    expect(body.alreadyMember).toBe(0);
  });

  it("defaults cardIds to [] when omitted", async () => {
    const response = (await POST(req({ name: "Sin miembros" }))) as Response;
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.added).toBe(0);
  });

  it("rejects an empty name with 400", async () => {
    const response = (await POST(req({ name: "" }))) as Response;
    expect(response.status).toBe(400);
  });

  it("rejects more than 500 cardIds with 400 and performs no writes", async () => {
    const cardIds = Array.from({ length: 501 }, (_, i) => `card-${i}`);
    const response = (await POST(req({ name: "Demasiadas", cardIds }))) as Response;
    expect(response.status).toBe(400);
    expect(prismaMock.cardGroup.create).not.toHaveBeenCalled();
  });

  it("returns 409 on a duplicate name instead of throwing", async () => {
    await POST(req({ name: "Duplicado", cardIds: [] }));
    const response = (await POST(req({ name: "Duplicado", cardIds: [] }))) as Response;
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/ya existe/i);
  });

  it("denies FACTURACION and MENSAJERO with 403", async () => {
    for (const role of ["FACTURACION", "MENSAJERO"]) {
      setRole(role);
      const response = (await POST(req({ name: "X", cardIds: [] }))) as Response;
      expect(response.status).toBe(403);
    }
  });
});

describe("PATCH /api/card-groups/[id]", () => {
  async function createGroup(name: string, cardIds: string[] = []) {
    const response = (await POST(req({ name, cardIds }))) as Response;
    const body = await response.json();
    return body.group.id as string;
  }

  it("renames a group", async () => {
    const id = await createGroup("Original");
    const response = (await PATCH(req({ name: "Renombrado" }), {
      params: Promise.resolve({ id }),
    })) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.group.name).toBe("Renombrado");
  });

  it("returns 409 when the rename collides with another group's name", async () => {
    await createGroup("Grupo X");
    const id = await createGroup("Grupo Y");
    const response = (await PATCH(req({ name: "Grupo X" }), {
      params: Promise.resolve({ id }),
    })) as Response;
    expect(response.status).toBe(409);
  });

  it("returns 404 when the group does not exist", async () => {
    const response = (await PATCH(req({ name: "X" }), {
      params: Promise.resolve({ id: "missing" }),
    })) as Response;
    expect(response.status).toBe(404);
  });

  it("denies MENSAJERO with 403", async () => {
    const id = await createGroup("Protegido");
    setRole("MENSAJERO");
    const response = (await PATCH(req({ name: "X" }), {
      params: Promise.resolve({ id }),
    })) as Response;
    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/card-groups/[id]", () => {
  it("deletes an existing group", async () => {
    const created = (await POST(req({ name: "Borrar", cardIds: [] }))) as Response;
    const body = await created.json();
    const response = (await DELETE(req(), { params: Promise.resolve({ id: body.group.id }) })) as Response;
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.ok).toBe(true);
  });

  it("returns 404 for a missing group instead of throwing", async () => {
    const response = (await DELETE(req(), { params: Promise.resolve({ id: "missing" }) })) as Response;
    expect(response.status).toBe(404);
  });
});
