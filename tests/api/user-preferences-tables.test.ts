import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, requireApiSessionMock } = vi.hoisted(() => ({
  prismaMock: {
    userTablePreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  requireApiSessionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: requireApiSessionMock }));

import { GET, PUT } from "@/app/api/user-preferences/tables/[tableKey]/route";
import { TARJETAS_COLUMNS } from "@/lib/table-columns/catalogs";
import { defaultColumnPreferences } from "@/lib/table-columns/column-preferences";

const ctx = (tableKey: string) => ({ params: Promise.resolve({ tableKey }) });

function putReq(body: unknown) {
  return new Request("http://localhost/api/user-preferences/tables/tarjetas", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let authenticated = true;

beforeEach(() => {
  vi.clearAllMocks();
  authenticated = true;
  requireApiSessionMock.mockImplementation(async () =>
    authenticated
      ? { session: { user: { id: "user-1", role: "OPERADOR" } } }
      : { error: new Response(null, { status: 401 }) },
  );
  prismaMock.userTablePreference.upsert.mockImplementation(async ({ create }: { create: object }) => ({
    ...create,
    updatedAt: new Date("2026-11-15T12:00:00Z"),
  }));
});

describe("GET /api/user-preferences/tables/[tableKey]", () => {
  it("requires a session", async () => {
    authenticated = false;
    const res = await GET(new Request("http://localhost"), ctx("tarjetas"));
    expect(res.status).toBe(401);
    expect(prismaMock.userTablePreference.findUnique).not.toHaveBeenCalled();
  });

  it("returns the catalog defaults when the user has no saved layout", async () => {
    prismaMock.userTablePreference.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), ctx("tarjetas"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(false);
    expect(body.columns).toEqual(defaultColumnPreferences(TARJETAS_COLUMNS));
    expect(prismaMock.userTablePreference.findUnique).toHaveBeenCalledWith({
      where: { userId_tableKey: { userId: "user-1", tableKey: "tarjetas" } },
    });
  });

  it("serves a saved layout reconciled with the current catalog", async () => {
    prismaMock.userTablePreference.findUnique.mockResolvedValue({
      columns: [
        { key: "acciones", visible: true },
        { key: "estado", visible: true },
        { key: "cliente", visible: false },
      ],
      updatedAt: new Date("2026-11-15T12:00:00Z"),
    });
    const res = await GET(new Request("http://localhost"), ctx("tarjetas"));
    const body = await res.json();
    expect(body.saved).toBe(true);
    expect(body.columns.slice(0, 2)).toEqual([
      { key: "estado", visible: true },
      { key: "cliente", visible: false },
    ]);
    expect(body.columns).toHaveLength(TARJETAS_COLUMNS.length);
    expect(body.columns.some((column: { key: string }) => column.key === "acciones")).toBe(false);
  });

  it("returns 404 for an unknown table", async () => {
    const res = await GET(new Request("http://localhost"), ctx("constructor"));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/user-preferences/tables/[tableKey]", () => {
  it("requires a session", async () => {
    authenticated = false;
    const res = await PUT(putReq({ columns: [] }), ctx("tarjetas"));
    expect(res.status).toBe(401);
    expect(prismaMock.userTablePreference.upsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload", async () => {
    const res = await PUT(putReq({ columns: [{ key: "tc", visible: "yes" }] }), ctx("tarjetas"));
    expect(res.status).toBe(400);
    expect(prismaMock.userTablePreference.upsert).not.toHaveBeenCalled();
  });

  it("persists a sanitized layout for the session user", async () => {
    const res = await PUT(
      putReq({
        columns: [
          { key: "cliente", visible: true },
          { key: "cliente", visible: false },
          { key: "acciones", visible: true },
          { key: "tc", visible: false },
        ],
      }),
      ctx("tarjetas"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.columns.slice(0, 2)).toEqual([
      { key: "cliente", visible: true },
      { key: "tc", visible: true },
    ]);
    expect(body.columns).toHaveLength(TARJETAS_COLUMNS.length);

    const call = prismaMock.userTablePreference.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId_tableKey: { userId: "user-1", tableKey: "tarjetas" } });
    expect(call.create).toEqual({ userId: "user-1", tableKey: "tarjetas", columns: body.columns });
    expect(call.update).toEqual({ columns: body.columns });
  });

  it("returns 404 for an unknown table without writing", async () => {
    const res = await PUT(putReq({ columns: [] }), ctx("otra-tabla"));
    expect(res.status).toBe(404);
    expect(prismaMock.userTablePreference.upsert).not.toHaveBeenCalled();
  });
});
