import { describe, expect, it } from "vitest";
import { calculateBilling, MissingBillingTariffError, type BillingProductType } from "@/lib/billing";

function card(id: string, productType: BillingProductType = "CREDITO", extra = {}) {
  return { id, productType, customerCedula: "001-1234567-8", dispatchDate: new Date("2026-09-09"), zona: "Metro", isRemote: false, ...extra };
}
function tariff(productType: BillingProductType, baseCents: number, zona = "Metro") {
  return { productType, baseCents, zona, active: true, ranges: [] as Array<{ minQty: number; maxQty: number | null; centsPerCard: number }> };
}

describe("product-specific billing", () => {
  it("charges two deliveries for credit and debit on the same customer/dispatch date, excluding duplicates and additionals", () => {
    const report = calculateBilling([card("credit"), card("duplicate", "CREDITO", { customerCedula: "00112345678" }), card("debit", "DEBITO"), card("additional", "DEBITO", { isAdditional: true })], [tariff("CREDITO", 100), tariff("DEBITO", 250)], 60);
    expect(report.totalEntregas).toBe(2);
    expect(report.additionalExcluded).toBe(1);
    expect(report.items.map((i) => [i.productType, i.qty, i.totalUsdCents])).toEqual([["CREDITO", 1, 100], ["DEBITO", 1, 250]]);
    expect(report.totalDopCents).toBe(21000);
  });

  it("applies volume tiers and remote surcharges independently for each product", () => {
    const credit = tariff("CREDITO", 100);
    credit.ranges = [{ minQty: 2, maxQty: 3, centsPerCard: 80 }];
    const debit = tariff("DEBITO", 250);
    debit.ranges = [{ minQty: 2, maxQty: null, centsPerCard: 200 }];
    const remote = tariff("CREDITO", 30, "REMOTA");
    remote.ranges = [{ minQty: 2, maxQty: null, centsPerCard: 10 }];
    const report = calculateBilling([card("c1", "CREDITO", { isRemote: true }), card("c2", "CREDITO", { customerCedula: "other", isRemote: true }), card("d1", "DEBITO", { isRemote: true })], [credit, debit, remote, tariff("DEBITO", 70, "REMOTA")], 60);
    expect(report.items.map((i) => i.totalUsdCents)).toEqual([160, 20, 250, 70]);
    expect(report.totalUsdCents).toBe(500);
  });

  it("blocks unconfigured debit without using credit prices or silently charging zero", () => {
    expect(() => calculateBilling([card("d", "DEBITO")], [tariff("CREDITO", 100)], 60)).toThrow(MissingBillingTariffError);
    expect(() => calculateBilling([card("d", "DEBITO", { isRemote: true })], [tariff("DEBITO", 200)], 60)).toThrow(/REMOTA/);
    expect(() => calculateBilling([card("d", "DEBITO")], [{ ...tariff("DEBITO", 200), active: false }], 60)).toThrow(MissingBillingTariffError);
  });

  it("allows explicitly configured zero rates and ignores missing unused tariffs", () => {
    expect(calculateBilling([card("c")], [tariff("CREDITO", 0)], 60).totalUsdCents).toBe(0);
    expect(calculateBilling([], [], 60).totalEntregas).toBe(0);
  });

  it("keeps different dispatch dates and null-date cards separate and sums rounded line totals", () => {
    const report = calculateBilling([card("c"), card("next", "CREDITO", { dispatchDate: new Date("2026-09-10") }), card("null1", "DEBITO", { dispatchDate: null }), card("null2", "DEBITO", { dispatchDate: null })], [tariff("CREDITO", 1), tariff("DEBITO", 1)], 1.25);
    expect(report.totalEntregas).toBe(4);
    expect(report.totalDopCents).toBe(6);
  });
});
