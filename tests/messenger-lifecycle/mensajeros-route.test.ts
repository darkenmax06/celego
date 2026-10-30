import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionalPrismaMock } from "../golden/helpers/mock-route";
import { firstCallArg, readJson } from "../golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "admin-1", email: "admin@example.com", role: "ADMIN" } },
  })),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-session";
import { DELETE, GET, PATCH } from "@/app/api/mensajeros/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const ID = "cmessenger00001";

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

function json(method: string, body: unknown) {
  return new Request("http://localhost/api/mensajeros", { method, body: JSON.stringify(body) });
}

beforeEach(() => {
  prisma.__reset();
  prisma.__seed("messenger", { id: ID, nombre: "Pedro", activo: true });
});

describe("GET /api/mensajeros onlyArchived (R3)", () => {
  it("filters activo:false for onlyArchived=1", async () => {
    await GET(req("/api/mensajeros?onlyArchived=1"));
    expect(firstCallArg(prisma.messenger.findMany).where).toEqual({ activo: false });
  });

  it("keeps onlyActive=1 semantics unchanged", async () => {
    await GET(req("/api/mensajeros?onlyActive=1"));
    expect(firstCallArg(prisma.messenger.findMany).where).toEqual({ activo: true });
  });

  it("lets onlyArchived win when both flags are sent", async () => {
    await GET(req("/api/mensajeros?onlyActive=1&onlyArchived=1"));
    expect(firstCallArg(prisma.messenger.findMany).where).toEqual({ activo: false });
  });

  it("keeps the dual-mode envelope with onlyArchived", async () => {
    const unpaginated = await readJson(await GET(req("/api/mensajeros?onlyArchived=1")));
    expect(Object.keys(unpaginated)).toEqual(["messengers"]);

    const paginated = await readJson(await GET(req("/api/mensajeros?onlyArchived=1&page=1")));
    expect(Object.keys(paginated)).toEqual(["messengers", "pagination"]);
    expect(firstCallArg(prisma.messenger.count).where).toEqual({ activo: false });
  });

  it("ignores onlyArchived values other than 1", async () => {
    await GET(req("/api/mensajeros?onlyArchived=0"));
    expect(firstCallArg(prisma.messenger.findMany).where).toEqual({});
  });
});

describe("PATCH /api/mensajeros no longer controls activo (R4.1)", () => {
  it("updates other fields and leaves an archived messenger archived", async () => {
    prisma.__seed("messenger", { id: ID, nombre: "Pedro", activo: false });

    const response = await PATCH(json("PATCH", { id: ID, nombre: "Pedro Nuevo", activo: true, rates: [] }));

    expect(response?.status).toBe(200);
    const data = firstCallArg(prisma.messenger.update).data as Record<string, unknown>;
    expect("activo" in data).toBe(false);
    expect(prisma.__row("messenger", ID)).toMatchObject({ nombre: "Pedro Nuevo", activo: false });
    expect(prisma.__rows("auditLog")).toHaveLength(0);
  });
});

describe("legacy DELETE /api/mensajeros (R1.6)", () => {
  it("archives through the audited helper, keeps the row and answers {ok:true}", async () => {
    const response = await DELETE(json("DELETE", { id: ID }));

    expect(response?.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true });
    expect(prisma.__row("messenger", ID)).toMatchObject({ activo: false });
    expect(prisma.__rows("auditLog")[0]).toMatchObject({ entity: "MESSENGER", action: "ARCHIVE" });
    expect(prisma.messenger.delete).not.toHaveBeenCalled();
  });

  it("stays ADMIN only", async () => {
    await DELETE(json("DELETE", { id: ID }));
    expect(requireApiSession).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("answers 400 without id and 404 for an unknown id", async () => {
    expect((await DELETE(json("DELETE", {})))?.status).toBe(400);
    expect((await DELETE(json("DELETE", { id: "ghost" })))?.status).toBe(404);
    expect(prisma.__rows("auditLog")).toHaveLength(0);
  });

  it("is idempotent for an already archived messenger", async () => {
    prisma.__seed("messenger", { id: ID, nombre: "Pedro", activo: false });
    const response = await DELETE(json("DELETE", { id: ID }));
    expect(await readJson(response)).toEqual({ ok: true });
    expect(prisma.__rows("auditLog")).toHaveLength(0);
  });
});
