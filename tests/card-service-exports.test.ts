import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("./golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

import * as cardService from "@/lib/card-service";

describe("card-service exports", () => {
  it("no longer exposes the unused legacy upsertCardsFromImport", () => {
    expect(cardService).not.toHaveProperty("upsertCardsFromImport");
    expect(cardService).toHaveProperty("persistNormalizedCardImport");
  });
});
