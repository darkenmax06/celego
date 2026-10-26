import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { prismaMock, requireApiSession } = vi.hoisted(() => {
  const finder = () => vi.fn(async (): Promise<Array<Record<string, string>>> => []);
  const prismaMock = {
    provinceConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    card: { findMany: finder() },
    customer: { findMany: finder() },
    messenger: { findMany: finder() },
    cardDeliveryReassignment: { findMany: finder() },
    urgentCase: { findMany: finder() },
    sLAExtensionRequest: { findMany: finder() },
    lot: { findMany: finder() },
  };
  return { prismaMock, requireApiSession: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession }));

import { DELETE as rawDelete, PATCH as rawPatch } from "@/app/api/config/provincias/route";

// The route handlers are typed as possibly returning undefined (auth.error); tests always get a response.
const DELETE = async (request: Request) => (await rawDelete(request)) as Response;
const PATCH = async (request: Request) => (await rawPatch(request)) as Response;

function deleteReq(id?: string): Request {
  const url = `http://localhost/api/config/provincias${id ? `?id=${id}` : ""}`;
  return new Request(url, { method: "DELETE" });
}

function patchReq(body: unknown): Request {
  return { json: async () => body, headers: new Headers() } as unknown as Request;
}

const authorised = { session: { user: { id: "admin-1" } } };

beforeEach(() => {
  vi.clearAllMocks();
  requireApiSession.mockResolvedValue(authorised);
  prismaMock.provinceConfig.findUnique.mockResolvedValue({ id: "p1", nombre: "San Cristóbal" });
  prismaMock.provinceConfig.delete.mockResolvedValue({ id: "p1" });
  prismaMock.provinceConfig.update.mockResolvedValue({ id: "p1" });
  for (const model of [
    "card",
    "customer",
    "messenger",
    "cardDeliveryReassignment",
    "urgentCase",
    "sLAExtensionRequest",
    "lot",
  ] as const) {
    prismaMock[model].findMany.mockImplementation(async () => []);
  }
});

describe("DELETE /api/config/provincias", () => {
  it("returns the auth error for non-admin callers", async () => {
    requireApiSession.mockResolvedValue({
      error: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }),
    });
    const response = await DELETE(deleteReq("p1"));
    expect(response.status).toBe(403);
    expect(requireApiSession).toHaveBeenCalledWith(["ADMIN"]);
    expect(prismaMock.provinceConfig.delete).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    requireApiSession.mockResolvedValue({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });
    expect((await DELETE(deleteReq("p1"))).status).toBe(401);
  });

  it("returns 400 without id", async () => {
    expect((await DELETE(deleteReq())).status).toBe(400);
  });

  it("returns 404 for an unknown id", async () => {
    prismaMock.provinceConfig.findUnique.mockResolvedValue(null);
    expect((await DELETE(deleteReq("nope"))).status).toBe(404);
    expect(prismaMock.provinceConfig.delete).not.toHaveBeenCalled();
  });

  it("deletes an unreferenced province", async () => {
    const response = await DELETE(deleteReq("p1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(prismaMock.provinceConfig.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  const columns: Array<[string, "card" | "customer" | "messenger" | "cardDeliveryReassignment" | "urgentCase" | "sLAExtensionRequest" | "lot", string]> = [
    ["Card.provincia", "card", "provincia"],
    ["Card.reassignedProvince", "card", "reassignedProvince"],
    ["Customer.provincia", "customer", "provincia"],
    ["Messenger.provinciaTrabajo", "messenger", "provinciaTrabajo"],
    ["CardDeliveryReassignment.fromProvince", "cardDeliveryReassignment", "fromProvince"],
    ["CardDeliveryReassignment.toProvince", "cardDeliveryReassignment", "toProvince"],
    ["UrgentCase.provincia", "urgentCase", "provincia"],
    ["SLAExtensionRequest.provinciaOrigen", "sLAExtensionRequest", "provinciaOrigen"],
    ["SLAExtensionRequest.provinciaDestino", "sLAExtensionRequest", "provinciaDestino"],
    ["Lot.sentTo", "lot", "sentTo"],
  ];

  it.each(columns)("blocks deletion (409) when %s references the province (accent/case-insensitive)", async (label, model, column) => {
    prismaMock[model].findMany.mockImplementation((async (args: { select: Record<string, boolean> }) =>
      args.select[column] ? [{ [column]: "san cristobal" }] : []) as never);

    const response = await DELETE(deleteReq("p1"));
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toContain("Desactívala en su lugar");
    expect(json.references).toContain(label);
    expect(prismaMock.provinceConfig.delete).not.toHaveBeenCalled();
  });

  it("does not block on other provinces' values", async () => {
    prismaMock.card.findMany.mockImplementation(async () => [{ provincia: "SANTIAGO" }]);
    expect((await DELETE(deleteReq("p1"))).status).toBe(200);
  });
});

describe("PATCH /api/config/provincias", () => {
  it("returns 400 for an invalid payload", async () => {
    expect((await PATCH(patchReq({ id: "p1", active: "yes" }))).status).toBe(400);
    expect((await PATCH(patchReq({}))).status).toBe(400);
    expect(prismaMock.provinceConfig.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown id", async () => {
    prismaMock.provinceConfig.findUnique.mockResolvedValue(null);
    expect((await PATCH(patchReq({ id: "nope", active: false }))).status).toBe(404);
    expect(prismaMock.provinceConfig.update).not.toHaveBeenCalled();
  });

  it("toggles active", async () => {
    const response = await PATCH(patchReq({ id: "p1", active: false }));
    expect(response.status).toBe(200);
    expect(prismaMock.provinceConfig.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { zona: undefined, active: false },
    });
  });
});
