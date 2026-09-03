import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import zlib from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaMock } from "./helpers/mock-route";

/**
 * Slice 2, task 2.1 — `app/api/rutas/export/route.ts` must title Route/RouteItem
 * exports with Route terminology ("RUTA"), never "LOTE". Spec:
 * route-lot-terminology / "Export title corrected".
 *
 * Cutover is immediate (no transition period), so these assertions target the
 * NEW behavior directly rather than pinning the old "LOTE" strings.
 */

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/mock-route");
  return { prisma: createPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./helpers/mock-route");
  return { requireApiSession: createSessionMock("exporter-1") };
});

import { prisma as prismaImport } from "@/lib/prisma";
import { GET as exportRoute } from "@/app/api/rutas/export/route";

const prisma = prismaImport as unknown as ReturnType<typeof createPrismaMock>;

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

const ROUTE_ID = "route-cljroute0001abcdef";
const LOT_LABEL = ROUTE_ID.slice(-6).toUpperCase();

function seedRoute() {
  prisma.route.findUnique.mockResolvedValue({
    id: ROUTE_ID,
    fecha: new Date("2026-08-24T00:00:00.000Z"),
    messenger: { nombre: "Pedro Martinez" },
    items: [
      {
        sequence: 1,
        card: {
          tc: "TC-001",
          isAdditional: false,
          additionalIndex: null,
          slaDueDate: new Date("2026-08-31T00:00:00.000Z"),
          dispatchDate: new Date("2026-08-24T00:00:00.000Z"),
          customer: { nombre: "Juan Perez", cedula: "001-0000001-1", telefonosRaw: "8091234567" },
        },
      },
    ],
  });
}

/** Content streams in a pdf-lib PDF are FlateDecode; inflate + pull hex `Tj` strings. */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const decoded: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw))) {
    let inflated: Buffer;
    try {
      inflated = zlib.inflateSync(Buffer.from(match[1], "latin1"));
    } catch {
      continue;
    }
    const content = inflated.toString("latin1");
    const hexRe = /<([0-9A-Fa-f]+)>\s*Tj/g;
    let hexMatch: RegExpExecArray | null;
    while ((hexMatch = hexRe.exec(content))) {
      decoded.push(Buffer.from(hexMatch[1], "hex").toString("latin1"));
    }
  }
  return decoded.join(" ");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rutas export naming (Slice 2, task 2.1)", () => {
  it("titles the xlsx worksheet/header with RUTA, not LOTE, and names the file ruta-*.xlsx", async () => {
    seedRoute();

    const response = (await exportRoute(
      req(`/api/rutas/export?routeId=${ROUTE_ID}&format=xlsx`),
    )) as Response;

    expect(response.status).toBe(200);
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(`ruta-${LOT_LABEL}.xlsx`);
    expect(disposition).not.toContain("lote");

    const buffer = Buffer.from(await response.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    // exceljs ships its own `Buffer` type from a different @types/node
    // version than this project's, so TS sees two structurally-different
    // `Buffer` interfaces. Target the exact parameter type `.load()`
    // declares instead of naming `Buffer` directly.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];

    expect(sheet.name).toBe("RUTA");
    expect(sheet.name).not.toBe("LOTE");

    const titleCell = String(sheet.getRow(1).getCell(1).value ?? "");
    expect(titleCell).toBe(`RUTA ${LOT_LABEL}`);
    expect(titleCell).not.toContain("LOTE");

    const footerRow = sheet.getRow(sheet.rowCount);
    const footerText = String(footerRow.getCell(1).value ?? "");
    expect(footerText).toContain("Fecha limite de devolucion de la ruta");
    expect(footerText).not.toContain("lote");
  });

  it("titles the PDF with RUTA, not LOTE, and names the file ruta-*.pdf", async () => {
    seedRoute();

    const response = (await exportRoute(
      req(`/api/rutas/export?routeId=${ROUTE_ID}&format=pdf`),
    )) as Response;

    expect(response.status).toBe(200);
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(`ruta-${LOT_LABEL}.pdf`);
    expect(disposition).not.toContain("lote");

    const buffer = Buffer.from(await response.arrayBuffer());
    const text = extractPdfText(buffer);

    expect(text).toContain(`RUTA ${LOT_LABEL}`);
    expect(text).not.toContain("LOTE");
  });
});
