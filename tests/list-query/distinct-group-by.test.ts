import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaMock, firstCallArg, readJson } from "../golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createPrismaMock() };
});

let mockSessionRole = "ADMIN";
vi.mock("@/lib/api-session", async () => {
  return {
    requireApiSession: vi.fn(async (allowedRoles: string[]) => {
      if (!allowedRoles.includes(mockSessionRole)) {
        return {
          error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
        };
      }
      return {
        session: { user: { id: "user-1", name: "Tester", role: mockSessionRole } },
        user: { id: "user-1", role: mockSessionRole, active: true },
      };
    }),
  };
});

import { prisma as prismaImport } from "@/lib/prisma";
import { GET as getDistinct } from "@/app/api/list-query/distinct/route";
import { GET as getGroupBy } from "@/app/api/list-query/group-by/route";

const prisma = prismaImport as unknown as ReturnType<typeof createPrismaMock>;

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionRole = "ADMIN";
});

describe("GET /api/list-query/distinct", () => {
  it("rejects request missing required params with 400", async () => {
    const res = await getDistinct(req("/api/list-query/distinct"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await readJson(res!);
    expect(body.error).toMatch(/requeridos/);
  });

  it("rejects unknown resource with 404", async () => {
    const res = await getDistinct(req("/api/list-query/distinct?resource=desconocido&field=status"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });

  it("rejects non-whitelisted field with 400", async () => {
    const res = await getDistinct(req("/api/list-query/distinct?resource=tarjetas&field=notasConfidenciales"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await readJson(res!);
    expect(body.error).toMatch(/Campo no permitido/);
  });

  it("rejects unauthorized role with 403", async () => {
    mockSessionRole = "MENSAJERO"; // not allowed for config-usuarios (ADMIN only)
    const res = await getDistinct(req("/api/list-query/distinct?resource=config-usuarios&field=role"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it("returns distinct values for an allowed field and applies query filters", async () => {
    prisma.card.findMany.mockResolvedValue([
      { provincia: "AZUA" },
      { provincia: "SANTIAGO" },
      { provincia: "SANTO DOMINGO" },
    ]);

    const res = await getDistinct(req("/api/list-query/distinct?resource=tarjetas&field=provincia&status=DESPACHADA"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);

    const findManyArg = firstCallArg(prisma.card.findMany);
    expect(findManyArg.distinct).toEqual(["provincia"]);
    expect(findManyArg.where).toMatchObject({ status: "DESPACHADA" });

    const body = await readJson(res!);
    expect(body.resource).toBe("tarjetas");
    expect(body.field).toBe("provincia");
    expect(body.values).toEqual(["AZUA", "SANTIAGO", "SANTO DOMINGO"]);
    expect(body.total).toBe(3);
  });
});

describe("GET /api/list-query/group-by", () => {
  it("rejects request missing by parameter with 400", async () => {
    const res = await getGroupBy(req("/api/list-query/group-by?resource=tarjetas"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  it("rejects non-whitelisted by field with 400", async () => {
    const res = await getGroupBy(req("/api/list-query/group-by?resource=tarjetas&by=password"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  it("executes groupBy in a single query and aggregates counts on server", async () => {
    prisma.card.groupBy.mockResolvedValue([
      { status: "DESPACHADA", _count: { _all: 120 } },
      { status: "EN_RUTA", _count: { _all: 45 } },
    ]);

    const res = await getGroupBy(req("/api/list-query/group-by?resource=tarjetas&by=status&provincia=AZUA"));
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);

    const groupByArg = firstCallArg(prisma.card.groupBy);
    expect(groupByArg.by).toEqual(["status"]);
    expect(groupByArg.where).toMatchObject({ provincia: "AZUA" });

    const body = await readJson(res!);
    expect(body.resource).toBe("tarjetas");
    expect(body.by).toBe("status");
    expect(body.groups).toEqual([
      { key: "DESPACHADA", count: 120 },
      { key: "EN_RUTA", count: 45 },
    ]);
    expect(body.totalGroups).toBe(2);
  });
});
