import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD change `rutas-lotes-redesign` — Slice 3 (task 3.3, orchestrator-added).
 *
 * `app/api/importaciones/lotes/route.ts` was discovered as a 4th `Lot.estatus`
 * writer not covered by the original design/tasks: a bulk Excel-upload
 * endpoint that `prisma.lot.upsert()`s `estatus` directly from a free-text
 * "ESTATUS"/"STATUS" spreadsheet column, bypassing `applyLotItemResult`
 * entirely. Both the `update` and `create` branches of that upsert must also
 * dual-write the typed `estatusTipo` mirror, with report-and-skip (null, no
 * throw) for values `mapLotStatus` does not recognize.
 */

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("./golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./golden/helpers/mock-route");
  return { requireApiSession: createSessionMock("importer-user-1") };
});

vi.mock("@/lib/importers/lotes", () => ({
  parseLotesImport: vi.fn(),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { parseLotesImport } from "@/lib/importers/lotes";
import { POST as postImportLotes } from "@/app/api/importaciones/lotes/route";

const prisma = prismaImport as unknown as { lot: { upsert: ReturnType<typeof vi.fn> }; __reset(): void };
const mockedParse = parseLotesImport as unknown as ReturnType<typeof vi.fn>;

function uploadRequest(): Request {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3])], "lotes.xlsx"));
  return { formData: async () => form } as unknown as Request;
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("POST /api/importaciones/lotes dual-writes Lot.estatusTipo", () => {
  it("dual-writes estatusTipo on the update branch for a recognized value", async () => {
    mockedParse.mockReturnValue({
      rows: [
        {
          lotNumber: "LOTE-EXISTS-001",
          enviadoA: "Santiago",
          fechaEnvio: new Date("2026-08-01"),
          fechaRetorno: null,
          estatus: "EN TRANSITO",
        },
      ],
      errors: [],
      headerRowIndex: 0,
    });

    await postImportLotes(uploadRequest());

    const call = prisma.lot.upsert.mock.calls[0][0];
    expect(call.update.estatus).toBe("EN TRANSITO");
    expect(call.update.estatusTipo).toBe("EN_TRANSITO");
  });

  it("dual-writes estatusTipo on the create branch for the importer default 'PENDIENTE'", async () => {
    mockedParse.mockReturnValue({
      rows: [
        {
          lotNumber: "LOTE-NEW-002",
          enviadoA: "Santo Domingo",
          fechaEnvio: new Date("2026-08-02"),
          fechaRetorno: null,
          estatus: "PENDIENTE",
        },
      ],
      errors: [],
      headerRowIndex: 0,
    });

    await postImportLotes(uploadRequest());

    const call = prisma.lot.upsert.mock.calls[0][0];
    expect(call.create.estatus).toBe("PENDIENTE");
    expect(call.create.estatusTipo).toBe("PENDIENTE");
  });

  it("report-and-skip: an unmapped free-text spreadsheet value nulls estatusTipo without throwing", async () => {
    mockedParse.mockReturnValue({
      rows: [
        {
          lotNumber: "LOTE-UNMAPPED-003",
          enviadoA: "La Vega",
          fechaEnvio: new Date("2026-08-03"),
          fechaRetorno: null,
          estatus: "CERRADO MANUALMENTE",
        },
      ],
      errors: [],
      headerRowIndex: 0,
    });

    const response = await postImportLotes(uploadRequest());

    expect((response as Response).status).toBe(200);
    const call = prisma.lot.upsert.mock.calls[0][0];
    expect(call.update.estatus).toBe("CERRADO MANUALMENTE");
    expect(call.update.estatusTipo).toBeNull();
    expect(call.create.estatus).toBe("CERRADO MANUALMENTE");
    expect(call.create.estatusTipo).toBeNull();
  });
});
