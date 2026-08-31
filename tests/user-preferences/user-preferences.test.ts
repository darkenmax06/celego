import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaMock, readJson } from "../golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createPrismaMock() };
});

let currentUserId = "user-1";
vi.mock("@/lib/api-session", async () => {
  return {
    requireApiSession: vi.fn(async () => {
      return {
        session: { user: { id: currentUserId, name: "Tester", role: "OPERADOR" } },
        user: { id: currentUserId, role: "OPERADOR", active: true },
      };
    }),
  };
});

import { prisma as prismaImport } from "@/lib/prisma";
import { GET as getViewPref, PUT as putViewPref } from "@/app/api/user-preferences/views/route";
import { GET as getFilters, POST as postFilter } from "@/app/api/user-preferences/filters/route";
import { DELETE as deleteFilter, PATCH as patchFilter } from "@/app/api/user-preferences/filters/[id]/route";

const prisma = prismaImport as unknown as ReturnType<typeof createPrismaMock>;

function req(url: string, init?: RequestInit) {
  return new NextRequest(`http://localhost${url}`, init as unknown as ConstructorParameters<typeof NextRequest>[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId = "user-1";
});

describe("User View Preferences API", () => {
  it("rejects GET without sectionKey with 400", async () => {
    const res = await getViewPref(req("/api/user-preferences/views"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  it("returns null viewType when no preference exists", async () => {
    prisma.userViewPreference.findUnique.mockResolvedValue(null);
    const res = await getViewPref(req("/api/user-preferences/views?sectionKey=tarjetas"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await readJson(res!);
    expect(body).toEqual({ sectionKey: "tarjetas", viewType: null });
  });

  it("saves view preference bound to authenticated user", async () => {
    prisma.userViewPreference.upsert.mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      sectionKey: "tarjetas",
      viewType: "kanban",
      updatedAt: new Date("2026-08-29T12:00:00Z"),
    });

    const res = await putViewPref(
      new Request("http://localhost/api/user-preferences/views", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey: "tarjetas", viewType: "kanban" }),
      }),
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await readJson(res!);
    expect(body.ok).toBe(true);
    expect(body.viewType).toBe("kanban");
  });

  it("rejects invalid viewType with 400", async () => {
    const res = await putViewPref(
      new Request("http://localhost/api/user-preferences/views", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey: "tarjetas", viewType: "tipo_invalido" }),
      }),
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });
});

describe("User Saved Filters API", () => {
  it("creates a saved filter bound to session user", async () => {
    prisma.userSavedFilter.create.mockResolvedValue({
      id: "filter-1",
      userId: "user-1",
      sectionKey: "tarjetas",
      name: "Tarjetas Santo Domingo",
      filters: { provincia: "SANTO DOMINGO" },
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await postFilter(
      new Request("http://localhost/api/user-preferences/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey: "tarjetas",
          name: "Tarjetas Santo Domingo",
          filters: { provincia: "SANTO DOMINGO" },
          isDefault: true,
        }),
      }),
    );

    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    const body = await readJson(res!);
    expect((body.filter as { name: string }).name).toBe("Tarjetas Santo Domingo");
  });

  it("reads saved filters isolated to user and sectionKey", async () => {
    prisma.userSavedFilter.findMany.mockResolvedValue([
      { id: "filter-1", name: "Filtro 1", sectionKey: "tarjetas", userId: "user-1" },
    ]);

    const res = await getFilters(req("/api/user-preferences/filters?sectionKey=tarjetas"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await readJson(res!);
    expect(body.filters).toHaveLength(1);
  });

  it("prevents deleting a filter belonging to another user (404)", async () => {
    prisma.userSavedFilter.findUnique.mockResolvedValue({
      id: "filter-2",
      userId: "other-user", // different user
      sectionKey: "tarjetas",
      name: "Filtro ajeno",
    });

    const res = await deleteFilter(req("/api/user-preferences/filters/filter-2"), {
      params: Promise.resolve({ id: "filter-2" }),
    });

    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
    expect(prisma.userSavedFilter.delete).not.toHaveBeenCalled();
  });
});
