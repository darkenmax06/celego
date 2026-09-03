import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { readJson, type TransactionalPrismaMock } from "../golden/helpers/mock-route";

/**
 * Task 16.6 — proves the Phase 4 fix by EXECUTION instead of by source reading.
 *
 * `tests/cards/route-proof-transaction.test.ts` asserts that the `routeItem`
 * write lives inside the `$transaction` callback by brace-matching the source.
 * That detects drift but it does NOT prove a rollback: a mock that ignores
 * `$transaction` would pass it while the real handler leaked a mutation.
 *
 * These tests run the handler against a `$transaction`-aware store that really
 * rolls back on rejection, so `RouteItem.checkedAt` has to survive a failure
 * that happens AFTER it was written.
 */

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/mobile-session", () => ({
  requireMobileSession: vi.fn(async () => ({
    session: { user: { id: "user-1", role: "OPERADOR", messengerId: "messenger-1" } },
  })),
}));

vi.mock("@/lib/urgent-alerts", () => ({
  classifyCardLifecycle: vi.fn(() => "ACTIVE"),
  clearUrgencyOnCardClosure: vi.fn(async () => undefined),
  parkUrgencyOnPendingReception: vi.fn(async () => undefined),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { POST as uploadProof } from "@/app/api/mobile/rutas/pruebas/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;

const ROUTE_ITEM_ID = "route-item-1";
const CARD_ID = "card-1";

function proofRequest(markAs: string): NextRequest {
  const form = new FormData();
  form.set("routeItemId", ROUTE_ITEM_ID);
  form.set("markAs", markAs);
  form.set("note", "entregado en mano");
  form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "proof.jpg", { type: "image/jpeg" }));
  return { formData: async () => form } as unknown as NextRequest;
}

beforeEach(() => {
  prisma.__reset();
  prisma.__seed("routeItem", {
    id: ROUTE_ITEM_ID,
    cardId: CARD_ID,
    checkedAt: null,
    route: { id: "route-1", messengerId: "messenger-1" },
    card: { id: CARD_ID, status: "EN_RUTA", metadata: {} },
  });
  prisma.__seed("card", { id: CARD_ID, status: "EN_RUTA", metadata: {}, returnReason: null });
});

describe("mobile delivery-proof rollback (executed, not read)", () => {
  it("commits checkedAt and the card write together on success", async () => {
    const response = await uploadProof(proofRequest("ACUSE_RECIBIDO"));

    expect((response as Response).status).toBe(201);
    expect(await readJson(response)).toMatchObject({ uploaded: true, markAs: "ACUSE_RECIBIDO" });
    expect(prisma.__row("routeItem", ROUTE_ITEM_ID)?.checkedAt).toBeInstanceOf(Date);
    expect(prisma.__row("card", CARD_ID)?.status).toBe("ACUSE_RECIBIDO");
    expect(prisma.__rows("cardStatusLog")).toHaveLength(1);
  });

  it("leaves checkedAt untouched when a later write inside the transaction fails", async () => {
    // The status log is the LAST write in the callback, so it fails strictly
    // after `routeItem.update` has already run. Before the Phase 4 fix that
    // update lived outside the transaction and stayed committed here.
    prisma.cardStatusLog.create.mockRejectedValue(new Error("status log write failed"));

    await expect(uploadProof(proofRequest("ACUSE_RECIBIDO"))).rejects.toThrow(
      "status log write failed",
    );

    expect(prisma.routeItem.update).toHaveBeenCalledTimes(1);
    expect(prisma.__row("routeItem", ROUTE_ITEM_ID)?.checkedAt).toBeNull();
    expect(prisma.__row("card", CARD_ID)?.status).toBe("EN_RUTA");
    expect(prisma.__rows("cardStatusLog")).toHaveLength(0);
  });

  it("rolls the cleared checkedAt back too when the card goes back out on route", async () => {
    prisma.__seed("routeItem", {
      id: ROUTE_ITEM_ID,
      cardId: CARD_ID,
      checkedAt: new Date("2026-08-20T10:00:00.000Z"),
      route: { id: "route-1", messengerId: "messenger-1" },
      card: { id: CARD_ID, status: "ACUSE_RECIBIDO", metadata: {} },
    });
    prisma.cardStatusLog.create.mockRejectedValue(new Error("status log write failed"));

    await expect(uploadProof(proofRequest("EN_RUTA"))).rejects.toThrow("status log write failed");

    // `resolveRouteItemCheckedAt("EN_RUTA")` nulls it; the rollback must restore
    // the original timestamp, not merely avoid stamping a new one.
    expect(prisma.__row("routeItem", ROUTE_ITEM_ID)?.checkedAt).toEqual(
      new Date("2026-08-20T10:00:00.000Z"),
    );
  });
});
