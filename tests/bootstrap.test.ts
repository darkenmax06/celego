import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeRawUnsafe } = vi.hoisted(() => ({
  executeRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRawUnsafe: executeRawUnsafe },
}));

import { ensureDebitCardIntegrity } from "@/lib/bootstrap";

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

  it("rethrows unexpected index errors", async () => {
    const error = new Error("database unavailable");
    executeRawUnsafe.mockRejectedValueOnce(error);

    await expect(ensureDebitCardIntegrity()).rejects.toBe(error);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
