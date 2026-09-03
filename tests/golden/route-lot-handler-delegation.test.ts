import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJson, type TransactionalPrismaMock } from "./helpers/mock-route";

/**
 * SDD change `rutas-lotes-redesign` — Slice 4b (task 4.5/4.6/5.4's handler side).
 *
 * These tests are NEW for this batch (kept separate from Slice 1's
 * characterization file, which must run UNCHANGED as the parity gate). They
 * pin the two behaviors the characterization suite cannot express because it
 * has no reason to mock `lib/card-transition-observer`:
 *
 *  1. Design D3 — `emitTransitionObservations()` runs post-commit and its
 *     failure MUST NOT affect the already-committed write's HTTP response.
 *  2. Both handlers actually call `emitTransitionObservations()` at all (the
 *     final missing piece of task 5.4 — SHADOW wiring was service-side only
 *     through Slice 4a; this proves the handler side now flushes it).
 */

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("./helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

vi.mock("@/lib/urgent-alerts", () => ({
  classifyCardLifecycle: vi.fn(() => "ACTIVE"),
  clearUrgencyOnCardClosure: vi.fn(async () => undefined),
  parkUrgencyOnPendingReception: vi.fn(async () => undefined),
}));

vi.mock("@/lib/card-transition-observer", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/card-transition-observer")>(
      "@/lib/card-transition-observer",
    );
  return {
    ...actual,
    emitTransitionObservations: vi.fn(async () => {
      throw new Error("boom: AuditLog write failed");
    }),
  };
});

import { prisma as prismaImport } from "@/lib/prisma";
import { PATCH as patchRutas } from "@/app/api/rutas/route";
import { PATCH as patchLotes } from "@/app/api/lotes/route";
import { emitTransitionObservations } from "@/lib/card-transition-observer";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const mockedEmit = vi.mocked(emitTransitionObservations);

function patchRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("PATCH /api/rutas — post-commit observation emission never affects the response (design D3)", () => {
  const ROUTE_ID = "crouteone1";
  const ITEM_ID = "crouteitemone1";
  const CARD_ID = "route-card-1";

  it("still returns 200 with the updated result even when emitTransitionObservations rejects, and the flush was attempted", async () => {
    const cardRow = {
      id: CARD_ID,
      tc: "TC-1",
      status: "EN_RUTA",
      returnReason: null,
      metadata: {},
      currentMessengerId: null,
      digitalDeliveryCycle: 0,
    };
    prisma.__seed("card", structuredClone(cardRow));
    prisma.__seed("routeItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      routeId: ROUTE_ID,
      checkedAt: null,
      card: structuredClone(cardRow),
      route: { messengerId: "messenger-1", messenger: null },
    });
    prisma.__seed("route", { id: ROUTE_ID, status: "PENDIENTE" });

    const response = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    expect((response as Response).status).toBe(200);
    const body = await readJson(response);
    expect(body).toMatchObject({ updated: true, itemId: ITEM_ID, cardId: CARD_ID, routeId: ROUTE_ID });
    expect(mockedEmit).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/lotes — post-commit observation emission never affects the response (design D3)", () => {
  const LOT_ID = "clotone1";
  const ITEM_ID = "clotitemone1";
  const CARD_ID = "lot-card-1";

  it("still returns 200 with the updated result (including tc) even when emitTransitionObservations rejects", async () => {
    const cardRow = {
      id: CARD_ID,
      tc: "TC-9",
      status: "EN_RUTA",
      returnReason: null,
      metadata: {},
      currentMessengerId: "messenger-1",
      digitalDeliveryCycle: 0,
    };
    prisma.__seed("card", structuredClone(cardRow));
    prisma.__seed("lotItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      lotId: LOT_ID,
      tc: "TC-9",
      recibida: null,
      retornada: null,
      card: structuredClone(cardRow),
      lot: { id: LOT_ID, lotNumber: "LOTE-20260801-001" },
    });

    const response = await patchLotes(
      patchRequest({ action: "UPDATE_ITEM_RESULT", lotItemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    expect((response as Response).status).toBe(200);
    const body = await readJson(response);
    expect(body).toMatchObject({ updated: true, itemId: ITEM_ID, lotId: LOT_ID, tc: "TC-9" });
    expect(mockedEmit).toHaveBeenCalledTimes(1);
  });
});
