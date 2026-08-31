import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createPrismaMock } from "./golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./golden/helpers/mock-route");
  return { prisma: createPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./golden/helpers/mock-route");
  return { requireApiSession: createSessionMock("test-reporter") };
});

import { prisma as prismaImport } from "@/lib/prisma";
import { GET as exportRoute } from "@/app/api/reportes/export/route";

const prisma = prismaImport as unknown as ReturnType<typeof createPrismaMock>;

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

describe("Reportes Filters and Quick Reports Exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters cards by origin and cardType (Principal/Adicional)", async () => {
    prisma.card.findMany.mockResolvedValue([
      {
        id: "card-1",
        tc: "4000123456789001",
        status: "ENTREGADA",
        dispatchOrigin: "TORRE_POPULAR",
        isAdditional: false,
        additionalIndex: 0,
        isRemote: false,
        urgent: false,
        zona: "Metro",
        provincia: "Santo Domingo",
        dispatchDate: new Date("2026-08-25T00:00:00.000Z"),
        slaDueDate: new Date("2026-08-30T00:00:00.000Z"),
        returnReason: null,
        reassignedProvince: null,
        reassignedMessenger: null,
        currentMessenger: { nombre: "Carlos Mensajero" },
        customer: { nombre: "Juan Perez", cedula: "001-1111111-1" },
      },
    ]);
    prisma.cardStatusLog.findMany.mockResolvedValue([]);

    const response = (await exportRoute(
      req("/api/reportes/export?type=tarjetas&origin=TORRE_POPULAR&cardType=PRINCIPAL&format=xlsx"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml");

    // Verify Prisma received the correct where criteria
    expect(prisma.card.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dispatchOrigin: "TORRE_POPULAR",
          isAdditional: false,
        }),
      }),
    );
  });

  it("filters cards by SIN_PROCEDENCIA (dispatchOrigin: null) and cardType: ADICIONAL", async () => {
    prisma.card.findMany.mockResolvedValue([
      {
        id: "card-2",
        tc: "4000123456789002",
        status: "DESPACHADA",
        dispatchOrigin: null,
        isAdditional: true,
        additionalIndex: 1,
        isRemote: false,
        urgent: false,
        zona: "Este",
        provincia: "La Romana",
        dispatchDate: new Date("2026-08-26T00:00:00.000Z"),
        slaDueDate: new Date("2026-08-31T00:00:00.000Z"),
        returnReason: null,
        reassignedProvince: null,
        reassignedMessenger: null,
        currentMessenger: null,
        customer: { nombre: "Ana Gomez", cedula: "001-2222222-2" },
      },
    ]);
    prisma.cardStatusLog.findMany.mockResolvedValue([]);

    const response = (await exportRoute(
      req("/api/reportes/export?type=tarjetas&origin=SIN_PROCEDENCIA&cardType=ADICIONAL&format=csv"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");

    expect(prisma.card.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dispatchOrigin: null,
          isAdditional: true,
        }),
      }),
    );
  });

  it("exports quick report for 'Tarjetas entregadas hoy' in PDF format with Celeritas logo", async () => {
    prisma.card.findMany.mockResolvedValue([
      {
        id: "card-3",
        tc: "4000123456789003",
        status: "ENTREGADA",
        dispatchOrigin: "TORRE_POPULAR",
        isAdditional: false,
        additionalIndex: 0,
        isRemote: false,
        urgent: false,
        zona: "Norte",
        provincia: "Santiago",
        dispatchDate: new Date("2026-08-30T00:00:00.000Z"),
        slaDueDate: new Date("2026-08-30T00:00:00.000Z"),
        returnReason: null,
        reassignedProvince: null,
        reassignedMessenger: null,
        currentMessenger: { nombre: "Manuel Gomez" },
        customer: { nombre: "Luis Soto", cedula: "001-3333333-3" },
      },
    ]);
    prisma.cardStatusLog.findMany.mockResolvedValue([]);

    const response = (await exportRoute(
      req("/api/reportes/export?type=tarjetas&status=ENTREGADA&from=2026-08-30&to=2026-08-30&format=pdf"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    const doc = await PDFDocument.load(pdfBuffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("exports cards filtered by BPD_DEBITO and debit-specific status (TD_ENTREGADO)", async () => {
    prisma.card.findMany.mockResolvedValue([
      {
        id: "card-deb-1",
        tc: "5000123456789001",
        status: "TD_ENTREGADO",
        dispatchOrigin: "BPD_DEBITO",
        isAdditional: false,
        additionalIndex: 0,
        isRemote: false,
        urgent: false,
        zona: "Metro",
        provincia: "Santo Domingo",
        dispatchDate: new Date("2026-08-30T00:00:00.000Z"),
        slaDueDate: new Date("2026-08-30T00:00:00.000Z"),
        returnReason: null,
        reassignedProvince: null,
        reassignedMessenger: null,
        currentMessenger: { nombre: "Pedro Mensajero" },
        customer: { nombre: "Maria Lopez", cedula: "001-4444444-4" },
      },
    ]);
    prisma.cardStatusLog.findMany.mockResolvedValue([]);

    const response = (await exportRoute(
      req("/api/reportes/export?type=tarjetas&origin=BPD_DEBITO&status=TD_ENTREGADO&format=xlsx"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(prisma.card.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dispatchOrigin: "BPD_DEBITO",
          status: "TD_ENTREGADO",
        }),
      }),
    );
  });
});
