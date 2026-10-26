import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardStatus, CardProductType, DispatchOrigin } from "@prisma/client";
import { type TransactionalPrismaMock } from "../golden/helpers/mock-route";

/**
 * Rows whose province is configured as inactive are still imported exactly as
 * before; the import result only reports how many came that way and which
 * provinces, so the operator can review them.
 */

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});
vi.mock("@/lib/urgent-alerts", () => ({
  classifyCardLifecycle: vi.fn(() => "ACTIVE"),
  clearUrgencyOnCardClosure: vi.fn(async () => undefined),
  parkUrgencyOnPendingReception: vi.fn(async () => undefined),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import {
  persistDebitConsolidadoImport,
  persistDebitDespachoImport,
  persistNormalizedCardImport,
} from "@/lib/card-service";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const fn = (value: unknown) => value as ReturnType<typeof vi.fn>;

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
  prisma.__seed("cardImportBatch", { id: "batch-3", status: "PROCESSING" } as never);
  prisma.__seed("provinceConfig", { id: "p1", nombre: "Distrito Nacional", zona: "Metro", active: false } as never);
  prisma.__seed("provinceConfig", { id: "p2", nombre: "Santiago", zona: "Norte", active: true } as never);
  // The shared mock's findMany ignores `where`; honor the active filter here.
  fn(prisma.provinceConfig.findMany).mockImplementation(async ({ where }: { where?: { active?: boolean } } = {}) =>
    prisma.__rows("provinceConfig").filter((row) => where?.active === undefined || row.active === where.active),
  );
  fn(prisma.customer.upsert).mockImplementation(async ({ where, create }: { where: { cedula: string }; create: Record<string, unknown> }) => {
    const existing = prisma.__rows("customer").find((row) => row.cedula === where.cedula);
    if (existing) return existing;
    const row = { id: `customer-${where.cedula}`, ...create };
    prisma.__seed("customer", row as never);
    return row;
  });
  fn(prisma.sLAConfig.upsert).mockResolvedValue({ id: "default", businessDays: 5 });
  fn(prisma.card.findFirst).mockResolvedValue(null);
  fn(prisma.cardTcGuard.findUniqueOrThrow).mockImplementation(async ({ where }: { where: { tc: string } }) => ({
    tc: where.tc,
    activeCardId: null,
    deliveredCardId: null,
  }));
});

function debitRow(requestNumber: string, cedula: string, provincia: string) {
  return {
    requestNumber,
    tc: requestNumber,
    cedula,
    nombre: "Cliente",
    provincia,
    zona: "Metro",
    direccionRaw: "Calle 1",
    telefonosRaw: "8091234567",
    status: CardStatus.DESPACHADA,
    dispatchDate: new Date("2026-01-01T00:00:00Z"),
    isRemote: false,
    productType: CardProductType.DEBITO,
    dispatchOrigin: DispatchOrigin.BPD_DEBITO,
    rawRecord: {},
  } as never;
}

function creditRow(tc: string, cedula: string, provincia: string, sourceRowNumber: number) {
  return {
    origin: "TORRE_POPULAR",
    tc,
    cedula,
    nombre: "Cliente",
    direccionRaw: null,
    telefonosRaw: null,
    provincia,
    zona: null,
    isRemote: null,
    dispatchDate: new Date("2026-01-01T00:00:00Z"),
    quantity: 1,
    sourceTerminal: null,
    deliveryType: null,
    emissionType: null,
    supplier: null,
    contractType: null,
    externalReference: null,
    status: "DESPACHADA",
    sourceRowNumber,
    sourceRecordKey: `KEY-${tc}`,
  } as const;
}

describe("inactive province warning on card imports", () => {
  it("Despacho Débito still creates every card and counts the inactive-province rows", async () => {
    const result = await persistDebitDespachoImport({
      batchId: "batch-1",
      rows: [debitRow("REQ-1", "00100000001", "DN"), debitRow("REQ-2", "00100000002", "Distrito Nacional"), debitRow("REQ-3", "00100000003", "Santiago")],
    });

    expect(result.created).toBe(3);
    expect(prisma.__rows("card")).toHaveLength(3);
    expect(result.inactiveProvinceRows).toBe(2);
    expect(result.inactiveProvinceNames).toEqual(["Distrito Nacional"]);
  });

  it("Consolidado Débito reports the inactive-province rows it imported", async () => {
    const result = await persistDebitConsolidadoImport({
      batchId: "batch-2",
      rows: [debitRow("REQ-9", "00100000009", "distrito nacional")],
    });

    expect(result.created).toBe(1);
    expect(result.inactiveProvinceRows).toBe(1);
    expect(result.inactiveProvinceNames).toEqual(["Distrito Nacional"]);
  });

  it("Data Diaria Crédito counts only rows that became cards", async () => {
    const result = await persistNormalizedCardImport({
      batchId: "batch-3",
      rows: [creditRow("4111111111111111", "00100000011", "DN", 2), creditRow("4222222222222222", "00100000012", "Santiago", 3)],
      rejectedRows: [],
    });

    expect(result.created).toBe(2);
    expect(prisma.__rows("card").map((card) => card.provincia)).toEqual(["DN", "Santiago"]);
    expect(result.inactiveProvinceRows).toBe(1);
    expect(result.inactiveProvinceNames).toEqual(["Distrito Nacional"]);
  });

  it("reports zero when no row has an inactive province", async () => {
    const result = await persistDebitDespachoImport({
      batchId: "batch-4",
      rows: [debitRow("REQ-5", "00100000005", "Santiago")],
    });

    expect(result.inactiveProvinceRows).toBe(0);
    expect(result.inactiveProvinceNames).toEqual([]);
  });
});
