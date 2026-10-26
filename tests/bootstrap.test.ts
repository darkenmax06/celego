import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeRawUnsafe, provinceCount, provinceCreateMany, provinceUpsert, prismaMock } = vi.hoisted(() => {
  const executeRawUnsafe = vi.fn();
  const provinceCount = vi.fn();
  const provinceCreateMany = vi.fn();
  const provinceUpsert = vi.fn();
  const upsert = () => vi.fn(async () => ({}));
  const prismaMock: Record<string, unknown> = {
    $executeRawUnsafe: executeRawUnsafe,
    sLAConfig: { upsert: upsert() },
    debitConsolidadoExportConfig: { upsert: upsert() },
    provinceConfig: { count: provinceCount, createMany: provinceCreateMany, upsert: provinceUpsert },
    returnReason: { upsert: upsert() },
    zoneTariff: { upsert: upsert() },
    billingConfig: { upsert: upsert() },
  };
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
  return { executeRawUnsafe, provinceCount, provinceCreateMany, provinceUpsert, prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/card-transition-policy-store", () => ({
  ensureCardTransitionPolicy: vi.fn(async () => undefined),
}));

import { ensureBaseCatalogs, ensureDebitCardIntegrity } from "@/lib/bootstrap";
import { PROVINCIAS_INICIALES } from "@/lib/constants";

describe("ensureBaseCatalogs province seeding", () => {
  beforeEach(() => {
    executeRawUnsafe.mockReset().mockResolvedValue(0);
    provinceCount.mockReset();
    provinceCreateMany.mockReset().mockResolvedValue({ count: 0 });
    provinceUpsert.mockReset();
  });

  it("seeds provinces with createMany(skipDuplicates) when the table is empty", async () => {
    provinceCount.mockResolvedValue(0);
    await ensureBaseCatalogs();
    expect(provinceCreateMany).toHaveBeenCalledWith({
      data: PROVINCIAS_INICIALES.map((p) => ({ nombre: p.nombre, zona: p.zona })),
      skipDuplicates: true,
    });
    expect(provinceUpsert).not.toHaveBeenCalled();
  });

  it("does not resurrect deleted provinces when the table is not empty", async () => {
    provinceCount.mockResolvedValue(3);
    await ensureBaseCatalogs();
    expect(provinceCreateMany).not.toHaveBeenCalled();
    expect(provinceUpsert).not.toHaveBeenCalled();
  });
});

describe("ensureDebitCardIntegrity", () => {
  beforeEach(() => {
    executeRawUnsafe.mockReset();
  });

  it("continues bootstrap when legacy debit identities are duplicated", async () => {
    executeRawUnsafe
      .mockRejectedValueOnce({ code: "P2010", meta: { code: "23505" } })
      .mockResolvedValueOnce(0);

    await expect(ensureDebitCardIntegrity()).resolves.toBeUndefined();
    expect(executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it("drops the debit identifier check constraint instead of creating it", async () => {
    executeRawUnsafe.mockResolvedValue(0);

    await ensureDebitCardIntegrity();

    const statements = executeRawUnsafe.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => /ADD CONSTRAINT card_product_identifier_valid/.test(sql))).toBe(
      false,
    );
    expect(
      statements.some((sql) =>
        /DROP CONSTRAINT IF EXISTS card_product_identifier_valid/.test(sql),
      ),
    ).toBe(true);
  });

  it("rethrows unexpected index errors", async () => {
    const error = new Error("database unavailable");
    executeRawUnsafe.mockRejectedValueOnce(error);

    await expect(ensureDebitCardIntegrity()).rejects.toBe(error);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
