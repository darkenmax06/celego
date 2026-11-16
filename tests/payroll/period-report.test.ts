import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  messenger: { findUnique: vi.fn() },
  payrollPeriod: { findUnique: vi.fn() },
  messengerDailyRecord: { findMany: vi.fn() },
  messengerReport: { upsert: vi.fn() },
  $transaction: vi.fn(),
  openPayment: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/payroll/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payroll/payments")>()),
  openPayment: db.openPayment,
}));

import {
  readStoredReport,
  resolveStoredReportPath,
  storePeriodReport,
} from "@/lib/payroll/period-report";

const MESSENGER = "cmessenger00001";
const PERIOD = "cperiod0000001";
const fromDate = new Date("2026-10-01T00:00:00.000Z");
const toDate = new Date("2026-10-15T00:00:00.000Z");

let storageDir: string;

function payment(netCents: number) {
  return {
    netCents,
    installments: [
      {
        status: "APLICADA",
        number: 1,
        appliedCents: 5_000,
        plannedCents: 5_000,
        loan: { principalCents: 20_000, installmentCount: 4, note: null },
      },
    ],
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  storageDir = await mkdtemp(path.join(os.tmpdir(), "celego-reports-"));
  process.env.APP_STORAGE_DIR = storageDir;
  db.messenger.findUnique.mockResolvedValue({ id: MESSENGER, nombre: "Ana Perez" });
  db.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD, label: "Quincena 1", fromDate, toDate, messengerId: null });
  db.messengerDailyRecord.findMany.mockResolvedValue([
    {
      fecha: new Date("2026-10-02T00:00:00.000Z"),
      siguienteCorte: false,
      entregasNormales: 3,
      entregasRemotas: 1,
      recogidasBanco: 0,
      mandados: 0,
      totalCents: 45_000,
    },
  ]);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  db.openPayment.mockResolvedValue(payment(40_000));
  db.messengerReport.upsert.mockImplementation(async (args: { create: Record<string, unknown> }) => ({ id: "rep-1", ...args.create }));
});

afterEach(async () => {
  delete process.env.APP_STORAGE_DIR;
  await rm(storageDir, { recursive: true, force: true });
});

describe("storePeriodReport", () => {
  it("stores the JPEG under messenger-reports and upserts the report of that period", async () => {
    await storePeriodReport({ messengerId: MESSENGER, periodId: PERIOD, userId: "user-1" });

    const imagePath = `messenger-reports/${MESSENGER}/${PERIOD}.jpg`;
    const file = await readFile(path.join(storageDir, imagePath));
    expect(file.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG magic number

    const args = db.messengerReport.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ messengerId_payrollPeriodId: { messengerId: MESSENGER, payrollPeriodId: PERIOD } });
    expect(args.create).toMatchObject({
      messengerId: MESSENGER,
      payrollPeriodId: PERIOD,
      imagePath,
      fromDate,
      toDate,
      totalCents: 40_000, // the payment net, after loan installments
      generatedById: "user-1",
    });
    expect(args.update).toMatchObject({ imagePath, totalCents: 40_000, anulada: false });
    expect(args.update.generatedAt).toBeInstanceOf(Date);
  });

  it("replaces the file and the row when the period is locked again", async () => {
    await storePeriodReport({ messengerId: MESSENGER, periodId: PERIOD });
    const first = await readFile(path.join(storageDir, `messenger-reports/${MESSENGER}/${PERIOD}.jpg`));

    db.openPayment.mockResolvedValue(payment(12_345));
    await storePeriodReport({ messengerId: MESSENGER, periodId: PERIOD });
    const second = await readFile(path.join(storageDir, `messenger-reports/${MESSENGER}/${PERIOD}.jpg`));

    expect(second.equals(first)).toBe(false);
    expect(db.messengerReport.upsert).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = db.messengerReport.upsert.mock.calls.map(([args]) => args);
    expect(secondCall.where).toEqual(firstCall.where);
    expect(secondCall.update.totalCents).toBe(12_345);
  });

  it("refuses a period that belongs to another messenger without writing anything", async () => {
    db.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD, label: "Propio", fromDate, toDate, messengerId: "cother00000001" });

    await expect(storePeriodReport({ messengerId: MESSENGER, periodId: PERIOD })).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
    expect(db.messengerReport.upsert).not.toHaveBeenCalled();
    expect(await readStoredReport(`messenger-reports/${MESSENGER}/${PERIOD}.jpg`)).toBeNull();
  });
});

describe("stored report paths", () => {
  it("never resolves outside the storage dir", () => {
    expect(resolveStoredReportPath("../secrets.txt")).toBeNull();
    expect(resolveStoredReportPath(path.resolve(storageDir, "..", "x.jpg"))).toBeNull();
    expect(resolveStoredReportPath("messenger-reports/a/b.jpg")).toBe(path.join(storageDir, "messenger-reports", "a", "b.jpg"));
  });

  it("reads back a missing file as null", async () => {
    expect(await readStoredReport("messenger-reports/none/none.jpg")).toBeNull();
  });
});
