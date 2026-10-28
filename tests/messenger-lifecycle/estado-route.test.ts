import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionalPrismaMock } from "../golden/helpers/mock-route";
import { readJson } from "../golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

const requireApiSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-session", () => ({ requireApiSession }));

import { prisma as prismaImport } from "@/lib/prisma";
import { GET, POST } from "@/app/api/mensajeros/estado/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const ID = "cmessenger00001";

function okSession() {
  requireApiSession.mockResolvedValue({
    session: { user: { id: "user-1", email: "op@example.com", role: "OPERADOR" } },
  });
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/mensajeros/estado", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  ) as Promise<Response>;
}

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/mensajeros/estado${query}`)) as Promise<Response>;
}

beforeEach(() => {
  prisma.__reset();
  requireApiSession.mockReset();
  okSession();
  prisma.__seed("messenger", { id: ID, nombre: "Pedro", activo: true });
});

describe("GET /api/mensajeros/estado (preview)", () => {
  it("returns counts without mutating (2 routes / 15 cards)", async () => {
    prisma.route.count.mockResolvedValue(2);
    prisma.card.count.mockResolvedValue(15);

    const response = await get(`?id=${ID}`);

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ id: ID, activo: true, openRoutes: 2, assignedCards: 15 });
    expect(prisma.__row("messenger", ID)?.activo).toBe(true);
    expect(prisma.__rows("auditLog")).toHaveLength(0);
  });

  it("answers 404 for an unknown id and 400 without id", async () => {
    expect((await get("?id=ghost")).status).toBe(404);
    expect((await get("")).status).toBe(400);
  });

  it("restricts the route to ADMIN and OPERADOR", async () => {
    await get(`?id=${ID}`);
    expect(requireApiSession).toHaveBeenCalledWith(["ADMIN", "OPERADOR"]);
  });

  it("forwards the auth error (401/403)", async () => {
    requireApiSession.mockResolvedValue({
      error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }),
    });
    expect((await get(`?id=${ID}`)).status).toBe(403);
  });
});

describe("POST /api/mensajeros/estado", () => {
  it("archives with open routes and cards untouched and returns both counts", async () => {
    prisma.route.count.mockResolvedValue(2);
    prisma.card.count.mockResolvedValue(15);

    const response = await post({ id: ID, action: "archive" });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ changed: true, openRoutes: 2, assignedCards: 15 });
    expect(body.messenger).toMatchObject({ id: ID, activo: false });
    expect(prisma.__row("messenger", ID)?.activo).toBe(false);
    expect(prisma.__rows("auditLog")[0]).toMatchObject({ action: "ARCHIVE", userId: "user-1" });
    expect(prisma.route.updateMany).not.toHaveBeenCalled();
    expect(prisma.card.updateMany).not.toHaveBeenCalled();
  });

  it("restores an archived messenger", async () => {
    prisma.__seed("messenger", { id: ID, nombre: "Pedro", activo: false });

    const response = await post({ id: ID, action: "restore" });

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ changed: true });
    expect(prisma.__row("messenger", ID)?.activo).toBe(true);
    expect(prisma.__rows("auditLog")[0]).toMatchObject({ action: "RESTORE" });
  });

  it("is a 200 no-op with changed:false and no audit on repeat", async () => {
    prisma.__seed("messenger", { id: ID, nombre: "Pedro", activo: false });

    const response = await post({ id: ID, action: "archive" });

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ changed: false });
    expect(prisma.__rows("auditLog")).toHaveLength(0);
  });

  it("answers 404 for an unknown id on archive and restore without audit", async () => {
    expect((await post({ id: "cghost0000001", action: "archive" })).status).toBe(404);
    expect((await post({ id: "cghost0000001", action: "restore" })).status).toBe(404);
    expect(prisma.__rows("auditLog")).toHaveLength(0);
  });

  it("answers 400 for invalid bodies", async () => {
    expect((await post({ id: ID, action: "delete" })).status).toBe(400);
    expect((await post({ id: "not a cuid", action: "archive" })).status).toBe(400);
    expect((await post({ action: "archive" })).status).toBe(400);
    const malformed = await POST(
      new Request("http://localhost/api/mensajeros/estado", { method: "POST", body: "{" }),
    );
    expect(malformed?.status).toBe(400);
  });

  it("restricts the route to ADMIN and OPERADOR and forwards auth errors", async () => {
    await post({ id: ID, action: "archive" });
    expect(requireApiSession).toHaveBeenCalledWith(["ADMIN", "OPERADOR"]);

    prisma.__seed("messenger", { id: ID, nombre: "Pedro", activo: true });
    requireApiSession.mockResolvedValue({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });
    expect((await post({ id: ID, action: "archive" })).status).toBe(401);
    expect(prisma.__row("messenger", ID)?.activo).toBe(true);
  });
});
