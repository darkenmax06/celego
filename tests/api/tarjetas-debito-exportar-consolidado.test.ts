import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    debitConsolidadoExportConfig: {
      findUnique: vi.fn(),
    },
    card: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({ session: { user: { id: "user-1" } } })),
}));
vi.mock("@/lib/generators/debit-consolidado-export", () => ({
  generateUpdatedConsolidadoExcel: vi.fn(() => Buffer.from("xlsx")),
}));

import { GET } from "@/app/api/tarjetas-debito/exportar-consolidado/route";

function request(): Request {
  return new Request("http://localhost/api/tarjetas-debito/exportar-consolidado");
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.card.findMany.mockResolvedValue([]);
  prismaMock.debitConsolidadoExportConfig.findUnique.mockResolvedValue({
    dispatchDateFrom: new Date("2026-09-01T00:00:00.000Z"),
  });
});

describe("GET /api/tarjetas-debito/exportar-consolidado", () => {
  it("applies the configured dispatch date cutoff server-side", async () => {
    await GET(request());

    expect(prismaMock.debitConsolidadoExportConfig.findUnique).toHaveBeenCalledWith({
      where: { id: "default" },
      select: { dispatchDateFrom: true },
    });
    expect(prismaMock.card.findMany).toHaveBeenCalledWith({
      where: {
        productType: "DEBITO",
        dispatchDate: { gte: new Date("2026-09-01T00:00:00.000Z") },
      },
      include: {
        customer: true,
        logs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    });
  });

  it("exports without a date filter when the setting is empty", async () => {
    prismaMock.debitConsolidadoExportConfig.findUnique.mockResolvedValue({ dispatchDateFrom: null });

    await GET(request());

    expect(prismaMock.card.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productType: "DEBITO" } }),
    );
  });
});
