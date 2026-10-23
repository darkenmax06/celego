import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFPage } from "pdf-lib";
import ExcelJS from "exceljs";

const mocks = vi.hoisted(() => ({
  card: { findMany: vi.fn() },
  zoneTariff: { findMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
  zoneTariffRange: { deleteMany: vi.fn(), createMany: vi.fn() },
  billingConfig: { findUnique: vi.fn() },
  transaction: vi.fn(), auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { ...mocks, $transaction: mocks.transaction } }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));
import { GET as summaryRoute } from "@/app/api/facturacion/resumen/route";
import { GET as ratesRoute, POST as saveRoute } from "@/app/api/facturacion/tarifas/route";
import { POST as invoiceRoute } from "@/app/api/facturacion/factura/route";
import { GET as exportRoute } from "@/app/api/reportes/export/route";

function requireResponse<T extends Request>(handler: (request: T) => Promise<Response | undefined>) {
  return async (request: T) => {
    const response = await handler(request);
    if (!response) throw new Error("The route did not return a response");
    return response;
  };
}
const summary = requireResponse(summaryRoute);
const rates = requireResponse(ratesRoute);
const save = requireResponse(saveRoute);
const invoice = requireResponse(invoiceRoute);
const exportBilling = requireResponse(exportRoute);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ session: { user: { id: "tester" } } });
  mocks.card.findMany.mockResolvedValue([]);
  mocks.zoneTariff.findMany.mockResolvedValue([]);
  mocks.billingConfig.findUnique.mockResolvedValue(null);
  mocks.transaction.mockImplementation((fn) => fn(mocks));
});
const request = (body: unknown) => new Request("http://localhost/api/facturacion/tarifas", { method: "POST", body: JSON.stringify(body) });

describe("billing API products", () => {
  it("exports both product prices and rounded totals in the actual XLSX workbook", async () => {
    mocks.card.findMany.mockResolvedValue(["CREDITO", "DEBITO"].map((productType) => ({ id: productType, productType, zona: "Metro", provincia: "Santo Domingo", isRemote: false, dispatchDate: new Date("2026-09-09"), customer: { cedula: "001" } })));
    mocks.zoneTariff.findMany.mockResolvedValue(["CREDITO", "DEBITO"].map((productType) => ({ productType, zona: "Metro", baseCents: productType === "DEBITO" ? 3 : 1, active: true, ranges: [] })));
    const response = await exportBilling(new NextRequest("http://localhost/api/reportes/export?type=facturacion&format=xlsx&fxRate=1.5"));
    expect(response.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values).toEqual([undefined, "producto", "zona", "entregas", "adicionalesExcluidas", "tasaDolar", "tarifaPorTarjetaUSD", "totalUSD", "totalDOP"]);
    expect(sheet.getRow(2).values).toEqual([undefined, "Crédito", "Metro", 1, 0, "1.5000", "0.01", "0.01", "0.02"]);
    expect(sheet.getRow(3).values).toEqual([undefined, "Débito", "Metro", 1, 0, "1.5000", "0.03", "0.03", "0.05"]);
  });

  it("summary and generated PDF agree on two mixed deliveries and per-line DOP rounding", async () => {
    mocks.card.findMany.mockResolvedValue(["CREDITO", "DEBITO"].map((productType) => ({ id: productType, productType, zona: "Metro", provincia: "Santo Domingo", isRemote: false, dispatchDate: new Date("2026-09-09"), customer: { cedula: "001" } })));
    mocks.zoneTariff.findMany.mockResolvedValue(["CREDITO", "DEBITO"].map((productType) => ({ productType, zona: "Metro", baseCents: 1, active: true, ranges: [] })));
    const response = await summary(new NextRequest("http://localhost/api/facturacion/resumen?fxRate=1.5"));
    expect(await response.json()).toMatchObject({ totalEntregas: 2, totalUsdCents: 2, totalDopCents: 4 });
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");
    const pdf = await invoice(request({ from: "2026-09-01", to: "2026-09-09", fxRate: 1.5, invoiceNumber: "TEST", ncf: "TEST" }));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const texts = drawText.mock.calls.map(([text]) => text);
    expect(texts).toContain("Tarjetas crédito - Metro");
    expect(texts).toContain("Tarjetas débito - Metro");
    expect(texts).toContain("0.04");
  });

  it("includes every delivery in a period larger than 5000 cards", async () => {
    mocks.card.findMany.mockResolvedValue(Array.from({ length: 5001 }, (_, index) => ({ id: String(index), productType: "CREDITO", zona: "Metro", provincia: "Santo Domingo", isRemote: false, dispatchDate: new Date("2026-09-09"), customer: { cedula: String(index) } })));
    mocks.zoneTariff.findMany.mockResolvedValue([{ productType: "CREDITO", zona: "Metro", baseCents: 100, active: true, ranges: [] }]);
    const response = await summary(new NextRequest("http://localhost/api/facturacion/resumen"));
    expect(await response.json()).toMatchObject({ totalEntregas: 5001, totalUsdCents: 500100 });
  });
  it("queries only matching delivered terminal statuses without the old 5000-card cap", async () => {
    const res = await summary(new NextRequest("http://localhost/api/facturacion/resumen?from=2026-09-01&to=2026-09-09&zona=Metro"));
    expect(res.status).toBe(200);
    const args = mocks.card.findMany.mock.calls[0][0];
    expect(args.take).toBeUndefined();
    expect(args.where.OR).toEqual([{ productType: "CREDITO", status: "ENTREGADA" }, { productType: "DEBITO", status: "TD_ENTREGADO" }]);
    expect(args.where.AND[0].OR).toContainEqual({ reassignedZone: "Metro" });
    expect(args.where.dispatchDate.lte.toISOString()).toBe("2026-09-09T23:59:59.999Z");
  });

  it("rejects missing debit tariff in both summary and PDF before producing a document", async () => {
    mocks.card.findMany.mockResolvedValue([{ id: "d", productType: "DEBITO", zona: "Metro", provincia: "Santo Domingo", isRemote: false, dispatchDate: new Date("2026-09-09"), customer: { cedula: "001" } }]);
    const res = await summary(new NextRequest("http://localhost/api/facturacion/resumen"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("débito");
    const pdf = await invoice(request({ from: "2026-09-01", to: "2026-09-09", fxRate: 60, invoiceNumber: "TEST", ncf: "TEST" }));
    expect(pdf.status).toBe(409);
    const xlsx = await exportBilling(new NextRequest("http://localhost/api/reportes/export?type=facturacion&format=xlsx"));
    expect(xlsx.status).toBe(409);
  });

  it("isolates debit saves and range replacement in one transaction", async () => {
    mocks.zoneTariff.upsert.mockResolvedValue({ id: "debit-metro" });
    mocks.zoneTariff.findUnique.mockResolvedValue({ id: "debit-metro", productType: "DEBITO" });
    const res = await save(request({ productType: "DEBITO", zona: "Metro", baseCents: 250, ranges: [{ minQty: 2, maxQty: null, centsPerCard: 200 }] }));
    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.zoneTariff.upsert.mock.calls[0][0].where).toEqual({ productType_zona: { productType: "DEBITO", zona: "Metro" } });
    expect(mocks.zoneTariffRange.deleteMany).toHaveBeenCalledWith({ where: { zoneTariffId: "debit-metro" } });
  });

  it("does not accept ambiguous products, malformed JSON, negative amounts or overlapping ranges", async () => {
    for (const body of [{ zona: "Metro", baseCents: 100 }, { productType: "OTHER", zona: "Metro", baseCents: 100 }, { productType: "DEBITO", zona: "Metro", baseCents: -1 }, { productType: "DEBITO", zona: "Metro", baseCents: 100, ranges: [{ minQty: 1, maxQty: 3, centsPerCard: 10 }, { minQty: 3, maxQty: null, centsPerCard: 20 }] }]) {
      expect((await save(request(body))).status).toBe(400);
    }
    expect((await save(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("filters rate reads by product without seeding debit defaults", async () => {
    expect((await rates(new Request("http://localhost/api/facturacion/tarifas?productType=DEBITO"))).status).toBe(200);
    expect(mocks.zoneTariff.findMany.mock.calls[0][0].where).toEqual({ productType: "DEBITO" });
    expect(mocks.zoneTariff.upsert.mock.calls[0][0].create.productType).toBe("CREDITO");
  });

  it("rejects invalid dates and FX rates before database access", async () => {
    for (const query of ["from=bad", "from=2026-10-01&to=2026-09-01", "fxRate=-1"]) {
      expect((await summary(new NextRequest(`http://localhost/api/facturacion/resumen?${query}`))).status).toBe(400);
    }
    expect(mocks.card.findMany).not.toHaveBeenCalled();
  });
});
