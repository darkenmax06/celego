import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { prismaMock, requireApiSession } = vi.hoisted(() => {
  const finder = () => vi.fn(async (): Promise<Array<Record<string, string>>> => []);
  const writer = () => vi.fn(async (): Promise<{ count: number }> => ({ count: 0 }));
  const reference = () => ({ findMany: finder(), updateMany: writer(), count: vi.fn(async () => 0) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaMock: Record<string, any> = {
    provinceConfig: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    card: reference(),
    customer: reference(),
    messenger: reference(),
    cardDeliveryReassignment: reference(),
    urgentCase: reference(),
    sLAExtensionRequest: reference(),
    lot: reference(),
  };
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
  return { prismaMock, requireApiSession: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession }));

import { DELETE as rawDelete, PATCH as rawPatch, POST as rawPost } from "@/app/api/config/provincias/route";

// The route handlers are typed as possibly returning undefined (auth.error); tests always get a response.
const DELETE = async (request: Request) => (await rawDelete(request)) as Response;
const PATCH = async (request: Request) => (await rawPatch(request)) as Response;
const POST = async (request: Request) => (await rawPost(request)) as Response;

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
  prismaMock.provinceConfig.findMany.mockResolvedValue([]);
  prismaMock.provinceConfig.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }));
  prismaMock.provinceConfig.deleteMany.mockResolvedValue({ count: 0 });
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
    prismaMock[model].updateMany.mockImplementation(async () => ({ count: 0 }));
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

  it("blocks deletion when cards reference the province through an import alias", async () => {
    prismaMock.provinceConfig.findUnique.mockResolvedValue({ id: "p1", nombre: "Distrito Nacional" });
    prismaMock.card.findMany.mockImplementation((async (args: { select: Record<string, boolean> }) =>
      args.select.provincia ? [{ provincia: "DN" }] : []) as never);

    const response = await DELETE(deleteReq("p1"));
    expect(response.status).toBe(409);
    expect((await response.json()).references).toContain("Card.provincia");
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

function jsonReq(body: unknown): Request {
  return { json: async () => body, headers: new Headers() } as unknown as Request;
}

const sanPedroDeMacoris = { id: "spm", nombre: "San Pedro de Macoris", zona: "Este", active: true, aliases: [] as string[] };
const sanPedro = { id: "sp", nombre: "San Pedro", zona: "Sur", active: true, aliases: ["SP"] };
const higuey = { id: "hig", nombre: "Higuey", zona: "Este", active: true, aliases: ["Higüey (MG)"] };

describe("POST /api/config/provincias", () => {
  it("rejects a case/accent duplicate of an existing province", async () => {
    prismaMock.provinceConfig.findMany.mockResolvedValue([higuey]);
    const response = await POST(jsonReq({ nombre: "HIGÜEY", zona: "Este" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("«Higuey»");
    expect(prismaMock.provinceConfig.create).not.toHaveBeenCalled();
  });

  it("rejects a name that is already another province's variant", async () => {
    prismaMock.provinceConfig.findMany.mockResolvedValue([higuey]);
    const response = await POST(jsonReq({ nombre: "higuey (mg)", zona: "Este" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("variante de «Higuey»");
  });

  it("creates a new province with its sanitized variants", async () => {
    prismaMock.provinceConfig.findMany.mockResolvedValue([higuey]);
    const response = await POST(jsonReq({ nombre: " Punta Cana ", zona: "Este", aliases: ["Bavaro", " bávaro ", ""] }));
    expect(response.status).toBe(201);
    expect(prismaMock.provinceConfig.create).toHaveBeenCalledWith({
      data: { nombre: "Punta Cana", zona: "Este", active: true, aliases: ["Bavaro"] },
    });
  });
});

describe("PATCH /api/config/provincias aliases", () => {
  beforeEach(() => {
    prismaMock.provinceConfig.findUnique.mockResolvedValue(sanPedroDeMacoris);
    prismaMock.provinceConfig.findMany.mockResolvedValue([sanPedroDeMacoris, sanPedro, higuey]);
    prismaMock.provinceConfig.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...sanPedroDeMacoris, ...data }));
  });

  it("saves sanitized variants and rewrites references stored with them", async () => {
    prismaMock.card.findMany.mockImplementation((async (args: { select: Record<string, boolean> }) =>
      args.select.provincia ? [{ provincia: "SPM" }, { provincia: "San Pedro de Macoris" }] : []) as never);
    prismaMock.card.updateMany.mockResolvedValue({ count: 2 });

    const response = await PATCH(jsonReq({ id: "spm", aliases: [" SPM ", "spm", "San Pedro de Macorís", ""] }));
    expect(response.status).toBe(200);
    expect(prismaMock.provinceConfig.update).toHaveBeenCalledWith({
      where: { id: "spm" },
      data: { nombre: "San Pedro de Macoris", zona: undefined, active: undefined, aliases: ["SPM"] },
    });
    expect(prismaMock.card.updateMany).toHaveBeenCalledWith({
      where: { provincia: { in: ["SPM"] } },
      data: { provincia: "San Pedro de Macoris" },
    });
    expect(prismaMock.provinceConfig.deleteMany).not.toHaveBeenCalled();
  });

  it("reports ALIAS_CONFLICT when a variant is another province", async () => {
    const response = await PATCH(jsonReq({ id: "spm", aliases: ["SAN PEDRO"] }));
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.code).toBe("ALIAS_CONFLICT");
    expect(json.conflicts).toEqual([{ id: "sp", nombre: "San Pedro" }]);
    expect(prismaMock.provinceConfig.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("reports ALIAS_CONFLICT when a variant is another province's variant", async () => {
    const response = await PATCH(jsonReq({ id: "spm", aliases: ["higuey (mg)"] }));
    expect(response.status).toBe(409);
    expect((await response.json()).conflicts).toEqual([{ id: "hig", nombre: "Higuey" }]);
  });

  it("merges the conflicting province on confirmation", async () => {
    prismaMock.card.findMany.mockImplementation((async (args: { select: Record<string, boolean> }) =>
      args.select.provincia ? [{ provincia: "San Pedro" }, { provincia: "sp" }, { provincia: "Santiago" }] : []) as never);
    prismaMock.customer.findMany.mockImplementation((async () => [{ provincia: "SAN PEDRO" }]) as never);

    const response = await PATCH(jsonReq({ id: "spm", aliases: ["San Pedro"], merge: true }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.merged).toEqual([{ id: "sp", nombre: "San Pedro" }]);

    expect(prismaMock.provinceConfig.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sp"] } } });
    expect(prismaMock.provinceConfig.update).toHaveBeenCalledWith({
      where: { id: "spm" },
      data: { nombre: "San Pedro de Macoris", zona: undefined, active: undefined, aliases: ["San Pedro", "SP"] },
    });
    // Card rows move to the target province and zone; the unrelated value is untouched.
    expect(prismaMock.card.updateMany).toHaveBeenCalledWith({
      where: { provincia: { in: ["San Pedro", "sp"] }, NOT: { zona: "Este" } },
      data: { provincia: "San Pedro de Macoris", zona: "Este" },
    });
    expect(prismaMock.card.updateMany).toHaveBeenCalledWith({
      where: { provincia: { in: ["San Pedro", "sp"] } },
      data: { provincia: "San Pedro de Macoris" },
    });
    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { provincia: { in: ["SAN PEDRO"] } },
      data: { provincia: "San Pedro de Macoris" },
    });
    // All writes happen inside one transaction.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a rename onto another province's name", async () => {
    const response = await PATCH(jsonReq({ id: "spm", nombre: "san pedro" }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("PROVINCE_EXISTS");
  });

  it("renames and keeps the old name as a variant", async () => {
    const response = await PATCH(jsonReq({ id: "spm", nombre: "San Pedro de Macorís" }));
    expect(response.status).toBe(200);
    expect(prismaMock.provinceConfig.update).toHaveBeenCalledWith({
      where: { id: "spm" },
      data: { nombre: "San Pedro de Macorís", zona: undefined, active: undefined, aliases: [] },
    });
  });
});
