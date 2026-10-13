import { describe, expect, it } from "vitest";
import {
  buildLoanSchedule,
  loanBalanceCents,
  LoanScheduleError,
  nextPendingInstallment,
  uncoveredCents,
} from "../lib/payroll/loan-schedule";
import { dayKey, eachDay, findPeriod, payrollDay, periodsOverlap } from "../lib/payroll/period";

describe("buildLoanSchedule", () => {
  it("splits equally and gives the leftover cents to the first installments", () => {
    const plan = buildLoanSchedule({ principalCents: 100_001, installmentCount: 3, mode: "IGUALES" });
    expect(plan).toEqual([33_334, 33_334, 33_333]);
    expect(plan.reduce((a, b) => a + b, 0)).toBe(100_001);
  });

  it("accepts custom installments only when they add up to the principal", () => {
    expect(buildLoanSchedule({ principalCents: 90_000, installmentCount: 3, mode: "PERSONALIZADAS", customAmountsCents: [50_000, 25_000, 15_000] })).toEqual([50_000, 25_000, 15_000]);
    expect(() => buildLoanSchedule({ principalCents: 90_000, installmentCount: 3, mode: "PERSONALIZADAS", customAmountsCents: [50_000, 25_000, 10_000] })).toThrow(LoanScheduleError);
    expect(() => buildLoanSchedule({ principalCents: 90_000, installmentCount: 3, mode: "PERSONALIZADAS", customAmountsCents: [90_000] })).toThrow("Se esperaban 3");
  });

  it("rejects non-positive amounts and absurd counts", () => {
    expect(() => buildLoanSchedule({ principalCents: 0, installmentCount: 2, mode: "IGUALES" })).toThrow(LoanScheduleError);
    expect(() => buildLoanSchedule({ principalCents: 1_000, installmentCount: 0, mode: "IGUALES" })).toThrow(LoanScheduleError);
  });
});

describe("loan balance", () => {
  const installments = [
    { number: 1, plannedCents: 30_000, appliedCents: 40_000, status: "APLICADA" as const },
    { number: 2, plannedCents: 30_000, appliedCents: null, status: "OMITIDA" as const },
    { number: 3, plannedCents: 30_000, appliedCents: null, status: "PENDIENTE" as const },
  ];

  it("counts what was really deducted, not what was planned", () => {
    expect(loanBalanceCents(90_000, installments)).toBe(50_000);
  });

  it("reports the amount no pending installment covers after an omission or a bigger payment", () => {
    expect(uncoveredCents(90_000, installments)).toBe(20_000);
    expect(nextPendingInstallment(installments)?.number).toBe(3);
  });

  it("is zero when nothing is left to schedule", () => {
    const done = [{ number: 1, plannedCents: 90_000, appliedCents: 90_000, status: "APLICADA" as const }];
    expect(loanBalanceCents(90_000, done)).toBe(0);
    expect(uncoveredCents(90_000, done)).toBe(0);
    expect(nextPendingInstallment(done)).toBeNull();
  });
});

describe("payroll days and periods", () => {
  it("assigns an evening delivery in the Dominican Republic to its own calendar day", () => {
    // 23:30 on Oct 9 in UTC-4 is 03:30 on Oct 10 UTC.
    expect(dayKey(new Date("2026-10-10T03:30:00.000Z"))).toBe("2026-10-09");
    expect(dayKey(new Date("2026-10-10T04:00:00.000Z"))).toBe("2026-10-10");
    expect(payrollDay(new Date("2026-10-10T03:30:00.000Z")).toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("lists every day of a range inclusively", () => {
    expect(eachDay(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-03T00:00:00Z"))).toHaveLength(3);
  });

  const general = { id: "g", messengerId: null, fromDate: new Date("2026-10-01T00:00:00Z"), toDate: new Date("2026-10-15T00:00:00Z") };
  const own = { id: "m", messengerId: "ana", fromDate: new Date("2026-10-05T00:00:00Z"), toDate: new Date("2026-10-20T00:00:00Z") };

  it("prefers the messenger's own period over the general one", () => {
    const day = new Date("2026-10-10T00:00:00Z");
    expect(findPeriod([general, own], "ana", day)?.id).toBe("m");
    expect(findPeriod([general, own], "luis", day)?.id).toBe("g");
    expect(findPeriod([general, own], "ana", new Date("2026-11-01T00:00:00Z"))).toBeNull();
  });

  it("detects overlapping ranges, including shared boundary days", () => {
    expect(periodsOverlap(general, own)).toBe(true);
    expect(periodsOverlap(general, { fromDate: new Date("2026-10-15T00:00:00Z"), toDate: new Date("2026-10-30T00:00:00Z") })).toBe(true);
    expect(periodsOverlap(general, { fromDate: new Date("2026-10-16T00:00:00Z"), toDate: new Date("2026-10-30T00:00:00Z") })).toBe(false);
  });
});

describe("toPayrollDay", () => {
  it("keeps a plain day as is and converts timestamps to the Dominican day", async () => {
    const { toPayrollDay } = await import("../lib/payroll/period");
    expect(toPayrollDay("2026-10-09").toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(toPayrollDay("2026-10-10T03:30:00.000Z").toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(() => toPayrollDay("nope")).toThrow("Fecha invalida");
  });
});
