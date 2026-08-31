import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createPrismaMock } from "./golden/helpers/mock-route";
import { getCeleritasLogoPngBuffer } from "@/lib/reports/logo";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./golden/helpers/mock-route");
  return { prisma: createPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./golden/helpers/mock-route");
  return { requireApiSession: createSessionMock("exporter-user") };
});

import { prisma as prismaImport } from "@/lib/prisma";
import { GET as exportRoute } from "@/app/api/reportes/export/route";

const prisma = prismaImport as unknown as ReturnType<typeof createPrismaMock>;

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

describe("Celeritas Logo & Redaction PDF Export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensures public/celeritas-logo.svg exists and does not contain MENSAJERIA EXPRESS", () => {
    const svgPath = path.join(process.cwd(), "public", "celeritas-logo.svg");
    expect(fs.existsSync(svgPath)).toBe(true);

    const content = fs.readFileSync(svgPath, "utf8");
    expect(content).toContain("CELERITAS");
    expect(content.toLowerCase()).not.toContain("mensajeria");
    expect(content.toLowerCase()).not.toContain("mensajería");
    expect(content.toLowerCase()).not.toContain("express");
  });

  it("ensures getCeleritasLogoPngBuffer loads a valid PNG image", async () => {
    const buffer = await getCeleritasLogoPngBuffer();
    expect(buffer).not.toBeNull();
    expect(buffer instanceof Buffer).toBe(true);
    // PNG magic bytes header: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    expect(buffer![0]).toBe(0x89);
    expect(buffer![1]).toBe(0x50);
    expect(buffer![2]).toBe(0x4e);
    expect(buffer![3]).toBe(0x47);
  });

  it("exports a valid PDF with embedded Celeritas logo for entrega/retorno relations", async () => {
    prisma.redaction.findMany.mockResolvedValue([
      {
        id: "red-001",
        tipo: "ENTREGA",
        dispatchOrigin: "TORRE_POPULAR",
        zona: "Metro",
        fecha: new Date("2026-08-30T00:00:00.000Z"),
        items: [
          {
            id: "item-1",
            sequence: 1,
            comentario: null,
            card: {
              tc: "4000123456781111",
              dispatchDate: new Date("2026-08-30T00:00:00.000Z"),
              isAdditional: false,
              additionalIndex: 0,
              customer: { nombre: "Maria Rodriguez", cedula: "001-9999999-1" },
              reassignedProvince: null,
              reassignedMessenger: null,
            },
          },
        ],
      },
    ]);

    const response = (await exportRoute(
      req("/api/reportes/export?type=redaccion&format=pdf&origin=TORRE_POPULAR&redactionType=ENTREGA&zona=Metro"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify it parses as a valid PDF document with pages
    const doc = await PDFDocument.load(pdfBuffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);

    const firstPage = doc.getPage(0);
    expect(firstPage.getWidth()).toBe(792);
    expect(firstPage.getHeight()).toBe(612);
  });

  it("exports PDF by redactionIds without requiring origin or redactionType query params", async () => {
    prisma.redaction.findMany.mockResolvedValue([
      {
        id: "redaction-123456",
        tipo: "RETORNO",
        dispatchOrigin: "TORRE_POPULAR",
        zona: "Metro",
        fecha: new Date("2026-08-30T00:00:00.000Z"),
        items: [
          {
            id: "item-2",
            sequence: 1,
            comentario: "Cliente ausente",
            card: {
              tc: "4000123456782222",
              dispatchDate: new Date("2026-08-30T00:00:00.000Z"),
              isAdditional: false,
              additionalIndex: 0,
              customer: { nombre: "Pedro Lopez", cedula: "001-8888888-2" },
              reassignedProvince: null,
              reassignedMessenger: null,
            },
          },
        ],
      },
    ]);

    const response = (await exportRoute(
      req("/api/reportes/export?type=redaccion&format=pdf&redactionIds=redaction-123456"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("relacion-123456.pdf");

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    const doc = await PDFDocument.load(pdfBuffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
