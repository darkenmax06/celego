import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock: createMock } = await import("../golden/helpers/mock-route");
  return { prisma: createMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("../golden/helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

import { GET as exportPinit } from "@/app/api/tarjetas-debito/exportar-pinit/route";
import { prisma as prismaImport } from "@/lib/prisma";

const prisma = prismaImport as unknown as PrismaMock;

function request(): Request {
  return new Request("http://localhost/api/tarjetas-debito/exportar-pinit");
}

function debitCard(requestNumber: string, importBatchId: string) {
  return {
    requestNumber,
    tc: requestNumber,
    provincia: "Santo Domingo",
    zona: "METRO",
    dispatchDate: new Date("2026-08-30T00:00:00.000Z"),
    metadata: {},
    importBatchId,
    customer: {
      nombre: `Customer ${requestNumber}`,
      cedula: "00100000000",
      direccionRaw: "Main Street 1",
      telefonosRaw: "8095550000",
    },
  };
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("GET /api/tarjetas-debito/exportar-pinit", () => {
  it("exports only cards from the latest completed dispatch batch", async () => {
    vi.mocked(prisma.cardImportBatch.findFirst).mockResolvedValue({ id: "batch-latest" } as never);

    const cards = [debitCard("OLD-001", "batch-old"), debitCard("LATEST-001", "batch-latest")];
    vi.mocked(prisma.card.findMany).mockImplementation(async (args: { where: { importBatchId: string } }) =>
      cards.filter((card) => card.importBatchId === args.where.importBatchId) as never,
    );

    const response = await exportPinit(request());
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets.Sheet1, { header: 1 });

    expect(rows).toHaveLength(2);
    expect(rows[1][22]).toBe("LATEST-001");
    expect(prisma.cardImportBatch.findFirst).toHaveBeenCalledWith({
      where: { origin: "BPD_DEBITO", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });
    expect(prisma.card.findMany).toHaveBeenCalledWith({
      where: { productType: "DEBITO", importBatchId: "batch-latest" },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("does not fall back to older batches when no completed dispatch exists", async () => {
    vi.mocked(prisma.cardImportBatch.findFirst).mockResolvedValue(null);

    const response = await exportPinit(request());
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets.Sheet1, { header: 1 });

    expect(rows).toHaveLength(1);
    expect(prisma.card.findMany).not.toHaveBeenCalled();
  });
});
