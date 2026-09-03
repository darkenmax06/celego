import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 3, tasks 3.5/3.9 (design D9).
 *
 * `POST /api/urgentes/export` MUST accept raw `cardIds`/`groupId` with NO
 * urgent-only filter, since Pendiente de Recepcion reuses this endpoint
 * unchanged (spec: "Export parked cards from Pendiente de Recepcion"). This
 * is the explicit proof: a card with `urgent: false` (parked) must still be
 * exportable through this endpoint.
 */
const { cardStore, prismaMock } = vi.hoisted(() => {
  const cardStore = new Map<string, Record<string, unknown>>();
  const prismaMock = {
    card: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => {
        const ids = where?.id?.in;
        const all = [...cardStore.values()];
        return ids ? all.filter((c) => ids.includes(c.id as string)) : all;
      }),
    },
    auditLog: {
      create: vi.fn(async () => undefined),
    },
  };
  return { cardStore, prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "user-1" } },
  })),
}));

import { POST } from "@/app/api/urgentes/export/route";

function req(body: unknown): Request {
  return { json: async () => body, headers: new Headers() } as unknown as Request;
}

beforeEach(() => {
  cardStore.clear();
  vi.clearAllMocks();
});

describe("POST /api/urgentes/export — D9: parked cards are exportable", () => {
  it("accepts cardIds belonging to a parked (Pendiente de Recepcion) card and returns a valid xlsx file", async () => {
    cardStore.set("parked-1", {
      id: "parked-1",
      tc: "4000000000000099",
      status: "EN_PROCESO_DE_RETORNO",
      urgent: false,
      provincia: "SANTIAGO",
      zona: "Norte",
      customer: { nombre: "PARKED CLIENT", cedula: "001-9999999-9" },
    });

    const response = await POST(
      req({ columns: ["tc", "status"], format: "xlsx", cardIds: ["parked-1"] }),
    );

    expect((response as Response).status).toBe(200);
    const buffer = Buffer.from(await (response as Response).arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(prismaMock.card.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["parked-1"] } }) }),
    );
  });
});
