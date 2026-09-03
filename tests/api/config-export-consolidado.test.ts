import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, sessionMock } = vi.hoisted(() => ({
  prismaMock: {
    debitConsolidadoExportConfig: {
      upsert: vi.fn(),
    },
  },
  sessionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: sessionMock }));

import { GET, PATCH } from "@/app/api/config/export-consolidado/route";

let currentRole = "ADMIN";

function request(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

beforeEach(() => {
  currentRole = "ADMIN";
  vi.clearAllMocks();
  sessionMock.mockImplementation(async (roles: string[]) => {
    if (!roles.includes(currentRole)) {
      return { error: new Response(JSON.stringify({ error: "Sin permisos" }), { status: 403 }) };
    }
    return { session: { user: { id: "admin-1", role: currentRole } } };
  });
});

describe("/api/config/export-consolidado", () => {
  it("creates the singleton with no cutoff when it does not exist", async () => {
    const config = { id: "default", dispatchDateFrom: null };
    prismaMock.debitConsolidadoExportConfig.upsert.mockResolvedValue(config);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ config });
    expect(prismaMock.debitConsolidadoExportConfig.upsert).toHaveBeenCalledWith({
      where: { id: "default" },
      update: {},
      create: { id: "default", dispatchDateFrom: null },
    });
  });

  it("stores a date-only cutoff at the UTC start of that day", async () => {
    const config = { id: "default", dispatchDateFrom: new Date("2026-09-01T00:00:00.000Z") };
    prismaMock.debitConsolidadoExportConfig.upsert.mockResolvedValue(config);

    const response = await PATCH(request({ dispatchDateFrom: "2026-09-01" }));

    expect(response.status).toBe(200);
    expect(prismaMock.debitConsolidadoExportConfig.upsert).toHaveBeenCalledWith({
      where: { id: "default" },
      update: {
        dispatchDateFrom: new Date("2026-09-01T00:00:00.000Z"),
        updatedById: "admin-1",
      },
      create: {
        id: "default",
        dispatchDateFrom: new Date("2026-09-01T00:00:00.000Z"),
        updatedById: "admin-1",
      },
    });
  });

  it("normalizes ISO values and surrounding whitespace from existing client state", async () => {
    prismaMock.debitConsolidadoExportConfig.upsert.mockResolvedValue({
      id: "default",
      dispatchDateFrom: new Date("2026-09-01T00:00:00.000Z"),
    });

    const response = await PATCH(request({ dispatchDateFrom: " 2026-09-01T00:00:00.000Z " }));

    expect(response.status).toBe(200);
    expect(prismaMock.debitConsolidadoExportConfig.upsert.mock.calls[0][0].update).toMatchObject({
      dispatchDateFrom: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("clears the cutoff when the payload contains an empty date", async () => {
    prismaMock.debitConsolidadoExportConfig.upsert.mockResolvedValue({
      id: "default",
      dispatchDateFrom: null,
    });

    const response = await PATCH(request({ dispatchDateFrom: "" }));

    expect(response.status).toBe(200);
    expect(prismaMock.debitConsolidadoExportConfig.upsert.mock.calls[0][0].update).toMatchObject({
      dispatchDateFrom: null,
    });
  });

  it("rejects impossible calendar dates", async () => {
    const response = await PATCH(request({ dispatchDateFrom: "2026-02-30" }));

    expect(response.status).toBe(400);
    expect(prismaMock.debitConsolidadoExportConfig.upsert).not.toHaveBeenCalled();
  });

  it("allows only admins to change the cutoff", async () => {
    currentRole = "OPERADOR";

    const response = await PATCH(request({ dispatchDateFrom: "2026-09-01" }));

    expect(response.status).toBe(403);
    expect(prismaMock.debitConsolidadoExportConfig.upsert).not.toHaveBeenCalled();
  });
});
