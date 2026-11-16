import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const tx = {
    payrollPeriodLock: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  return {
    tx,
    prisma: {
      payrollPeriod: { findUnique: vi.fn() },
      payrollPeriodLock: { findUnique: vi.fn() },
      messenger: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
    closePayment: vi.fn(),
    storePeriodReport: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({ session: { user: { id: "user-1", role: "ADMIN" } } })),
}));
vi.mock("@/lib/payroll/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payroll/payments")>()),
  closePayment: db.closePayment,
}));
vi.mock("@/lib/payroll/period-report", () => ({ storePeriodReport: db.storePeriodReport }));

import { PATCH } from "@/app/api/mensajeros/periodos/route";

const PERIOD = "cperiod0000001";
const M1 = "cmessenger00001";
const M2 = "cmessenger00002";

async function patch(body: unknown) {
  return (await PATCH(new Request("http://localhost/api/mensajeros/periodos", { method: "PATCH", body: JSON.stringify(body) }))) as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.prisma.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD, label: "Quincena 1", messengerId: null });
  db.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db.tx));
  db.tx.payrollPeriodLock.findUnique.mockResolvedValue(null);
  db.tx.payrollPeriodLock.upsert.mockResolvedValue({});
  db.storePeriodReport.mockImplementation(async ({ messengerId }: { messengerId: string }) => ({
    id: `rep-${messengerId}`,
    generatedAt: new Date("2026-10-16T12:00:00.000Z"),
  }));
});

describe("PATCH /api/mensajeros/periodos LOCK generates the period report", () => {
  it("locks, closes the payment, then stores the report", async () => {
    const response = await patch({ action: "LOCK", periodId: PERIOD, messengerId: M1 });

    expect(response.status).toBe(200);
    expect(db.tx.payrollPeriodLock.upsert).toHaveBeenCalledTimes(1);
    expect(db.closePayment).toHaveBeenCalledWith(db.tx, M1, PERIOD);
    expect(db.storePeriodReport).toHaveBeenCalledWith({ messengerId: M1, periodId: PERIOD, userId: "user-1" });
    expect(db.closePayment.mock.invocationCallOrder[0]).toBeLessThan(db.storePeriodReport.mock.invocationCallOrder[0]);
    const body = await response.json();
    expect(body).toMatchObject({ status: "BLOQUEADO", report: { id: `rep-${M1}` } });
    expect(body.reportWarning).toBeUndefined();
  });

  it("keeps the lock and returns a warning when the report fails", async () => {
    db.storePeriodReport.mockRejectedValue(new Error("disk full"));

    const response = await patch({ action: "LOCK", periodId: PERIOD, messengerId: M1 });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("BLOQUEADO");
    expect(body.reportWarning).toMatch(/no se pudo generar el reporte/i);
    expect(body.report).toBeUndefined();
    expect(db.tx.payrollPeriodLock.upsert).toHaveBeenCalledTimes(1);
    expect(db.closePayment).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("does not try a report when the lock itself fails", async () => {
    db.closePayment.mockRejectedValueOnce(new Error("tx failed"));

    await expect(patch({ action: "LOCK", periodId: PERIOD, messengerId: M1 })).rejects.toThrow("tx failed");
    expect(db.storePeriodReport).not.toHaveBeenCalled();
  });

  it("re-locking after an unlock stores the report again for the same period", async () => {
    await patch({ action: "LOCK", periodId: PERIOD, messengerId: M1 });
    await patch({ action: "LOCK", periodId: PERIOD, messengerId: M1 });

    expect(db.storePeriodReport).toHaveBeenCalledTimes(2);
    expect(db.storePeriodReport.mock.calls[1][0]).toEqual(db.storePeriodReport.mock.calls[0][0]);
  });
});

describe("PATCH /api/mensajeros/periodos LOCK_ALL", () => {
  it("stores one report per newly locked messenger and lists the failures", async () => {
    db.prisma.messenger.findMany.mockResolvedValue([
      { id: M1, nombre: "Ana" },
      { id: M2, nombre: "Beto" },
    ]);
    db.storePeriodReport.mockImplementation(async ({ messengerId }: { messengerId: string }) => {
      if (messengerId === M2) throw new Error("render failed");
      return { id: `rep-${messengerId}`, generatedAt: new Date() };
    });

    const response = await patch({ action: "LOCK_ALL", periodId: PERIOD });

    expect(response.status).toBe(200);
    expect(db.closePayment).toHaveBeenCalledTimes(2);
    expect(db.storePeriodReport.mock.calls.map(([args]) => args.messengerId)).toEqual([M1, M2]);
    const body = await response.json();
    expect(body).toMatchObject({ locked: 2, reports: 1, reportFailures: [{ messengerId: M2, nombre: "Beto" }] });
    expect(body.reportWarning).toContain("Beto");
  });

  it("skips messengers that were already locked", async () => {
    db.prisma.messenger.findMany.mockResolvedValue([
      { id: M1, nombre: "Ana" },
      { id: M2, nombre: "Beto" },
    ]);
    db.tx.payrollPeriodLock.findUnique.mockImplementation(async ({ where }: { where: { periodId_messengerId: { messengerId: string } } }) =>
      where.periodId_messengerId.messengerId === M1 ? { status: "BLOQUEADO" } : null,
    );

    const body = await (await patch({ action: "LOCK_ALL", periodId: PERIOD })).json();

    expect(db.storePeriodReport.mock.calls.map(([args]) => args.messengerId)).toEqual([M2]);
    expect(body).toMatchObject({ locked: 2, reports: 1 });
    expect(body.reportWarning).toBeUndefined();
  });
});

describe("PATCH /api/mensajeros/periodos REGENERATE_REPORT", () => {
  it("refuses an open period", async () => {
    db.prisma.payrollPeriodLock.findUnique.mockResolvedValue({ status: "ABIERTO" });

    const response = await patch({ action: "REGENERATE_REPORT", periodId: PERIOD, messengerId: M1 });

    expect(response.status).toBe(409);
    expect(db.storePeriodReport).not.toHaveBeenCalled();
  });

  it("stores the report of a locked period again", async () => {
    db.prisma.payrollPeriodLock.findUnique.mockResolvedValue({ status: "BLOQUEADO" });

    const response = await patch({ action: "REGENERATE_REPORT", periodId: PERIOD, messengerId: M1 });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ report: { id: `rep-${M1}` } });
    expect(db.closePayment).not.toHaveBeenCalled();
  });

  it("answers 500 when the retry fails too", async () => {
    db.prisma.payrollPeriodLock.findUnique.mockResolvedValue({ status: "BLOQUEADO" });
    db.storePeriodReport.mockRejectedValue(new Error("still broken"));

    const response = await patch({ action: "REGENERATE_REPORT", periodId: PERIOD, messengerId: M1 });

    expect(response.status).toBe(500);
  });
});
