import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJson, type TransactionalPrismaMock } from "./helpers/mock-route";

/**
 * SDD change `rutas-lotes-redesign` — Slice 1 (Phase 1, tasks 1.1-1.3).
 *
 * Characterization tests for `applyItemResult` (app/api/rutas/route.ts) and
 * `applyLotItemResult` (app/api/lotes/route.ts), the two functions the design
 * refactors onto a shared `lib/item-outcome-service.ts` in a later slice.
 *
 * Both functions are module-private; Next.js App Router `route.ts` files reject
 * non-HTTP named exports, so they cannot be unit-tested by direct import. Every
 * assertion here therefore drives the exported `PATCH` handlers through the
 * `createTransactionalPrismaMock()` harness from `tests/golden/helpers/mock-route.ts`,
 * which gives real `$transaction` rollback semantics (task 16.6's harness).
 *
 * These tests MUST still pass, unchanged, after the Slice 4 refactor delegates
 * both handlers to the shared service (spec scenario "Pre/post-refactor parity").
 */

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("./helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

vi.mock("@/lib/mobile-session", () => ({
  requireMobileSession: vi.fn(async () => ({
    session: {
      user: {
        id: "mobile-user-1",
        email: "mensajero@example.com",
        name: "Mensajero Uno",
        role: "OPERADOR",
        messengerId: "messenger-1",
      },
    },
  })),
}));

vi.mock("@/lib/urgent-alerts", () => ({
  classifyCardLifecycle: vi.fn(() => "ACTIVE"),
  clearUrgencyOnCardClosure: vi.fn(async () => undefined),
  parkUrgencyOnPendingReception: vi.fn(async () => undefined),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { PATCH as patchRutas } from "@/app/api/rutas/route";
import { PATCH as patchLotes } from "@/app/api/lotes/route";
import { GET as getMobileRutas } from "@/app/api/mobile/rutas/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;

function patchRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function mobileReq(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("PATCH /api/rutas — applyItemResult (characterization)", () => {
  // `itemId`/`routeId` are zod `.cuid()`-validated by the PATCH schema, so
  // these fixtures must look like cuids (start with "c", no dashes/spaces).
  const ROUTE_ID = "crouteone1";
  const ITEM_ID = "crouteitemone1";
  const CARD_ID = "route-card-1";

  function seedSingleItemRoute(opts: {
    cardStatus: string;
    cardReturnReason?: string | null;
    cardMetadata?: Record<string, unknown>;
    checkedAt?: Date | null;
    messengerName?: string | null;
  }) {
    const cardRow = {
      id: CARD_ID,
      status: opts.cardStatus,
      returnReason: opts.cardReturnReason ?? null,
      metadata: opts.cardMetadata ?? {},
      currentMessengerId: null,
    };
    // Seed `card` and `routeItem.card` as SEPARATE object instances, not a
    // shared reference: real Prisma returns a fresh row object from every
    // query, so `tx.card.update()` never mutates the `item` object read
    // earlier via `tx.routeItem.findUnique()`. `applyItemResult` relies on
    // that: it reads `item.card.status` for `fromStatus` AFTER already
    // calling `tx.card.update()`. A shared reference here would make the
    // harness lie about `fromStatus`.
    prisma.__seed("card", structuredClone(cardRow));
    prisma.__seed("routeItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      routeId: ROUTE_ID,
      checkedAt: opts.checkedAt ?? null,
      card: structuredClone(cardRow),
      route: {
        messengerId: "messenger-1",
        messenger: opts.messengerName ? { nombre: opts.messengerName } : null,
      },
    });
    prisma.__seed("route", { id: ROUTE_ID, status: "PENDIENTE" });
    return cardRow;
  }

  it("marks ACUSE_RECIBIDO: sets checkedAt, nulls returnReason, logs with mensajero note", async () => {
    seedSingleItemRoute({ cardStatus: "EN_RUTA", messengerName: "Pedro Gonzalez" });

    const response = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(200);
    expect(body).toMatchObject({
      updated: true,
      itemId: ITEM_ID,
      cardId: CARD_ID,
      routeId: ROUTE_ID,
      routeStatus: "COMPLETADA",
    });

    expect(prisma.__row("routeItem", ITEM_ID)?.checkedAt).toBeInstanceOf(Date);

    const cardRow = prisma.__row("card", CARD_ID);
    expect(cardRow?.status).toBe("ACUSE_RECIBIDO");
    expect(cardRow?.returnReason).toBeNull();

    const logs = prisma.__rows("cardStatusLog");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      cardId: CARD_ID,
      fromStatus: "EN_RUTA",
      toStatus: "ACUSE_RECIBIDO",
      note: `Acuse recibido por mensajero Pedro Gonzalez (ruta ${ROUTE_ID})`,
    });
  });

  it("marks DEVUELTA_TIENDA with a comentario: sets returnReason and appends the comentario to the note", async () => {
    seedSingleItemRoute({ cardStatus: "EN_RUTA", messengerName: "Pedro Gonzalez" });

    const response = await patchRutas(
      patchRequest({
        action: "UPDATE_ITEM_RESULT",
        itemId: ITEM_ID,
        result: "DEVUELTA_TIENDA",
        comentario: "direccion incorrecta",
      }),
    );
    const body = await readJson(response);
    expect(body).toMatchObject({ updated: true, cardId: CARD_ID });

    const cardRow = prisma.__row("card", CARD_ID);
    expect(cardRow?.status).toBe("DEVUELTA_TIENDA");
    expect(cardRow?.returnReason).toBe("direccion incorrecta");

    const logs = prisma.__rows("cardStatusLog");
    expect(logs).toHaveLength(1);
    expect(logs[0].note).toBe("Tarjeta devuelta a tienda por mensajero Pedro Gonzalez: direccion incorrecta");
  });

  it("suppresses the CardStatusLog row when result stays EN_RUTA, unchanged, with no comentario", async () => {
    seedSingleItemRoute({
      cardStatus: "EN_RUTA",
      messengerName: "Pedro Gonzalez",
      checkedAt: new Date("2026-08-20T10:00:00.000Z"),
    });

    const response = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "EN_RUTA" }),
    );
    const body = await readJson(response);

    // Single item, transition clears checkedAt back to null (shouldSetChecked=false)
    // so the aggregate route status must fall back to PENDIENTE too.
    expect(body).toMatchObject({ routeStatus: "PENDIENTE" });
    expect(prisma.__row("routeItem", ITEM_ID)?.checkedAt).toBeNull();
    expect(prisma.__row("card", CARD_ID)?.status).toBe("EN_RUTA");
    expect(prisma.__rows("cardStatusLog")).toHaveLength(0);
  });

  it("preserves metadata.route.proofs and sibling metadata.operativo on merge", async () => {
    const existingProofs = [{ id: "proof-1", fileUrl: "https://x/proof.jpg" }];
    seedSingleItemRoute({
      cardStatus: "EN_RUTA",
      messengerName: "Pedro Gonzalez",
      cardMetadata: {
        route: { proofs: existingProofs, otherFlag: "keep-me" },
        operativo: { scanned: true },
      },
    });

    await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    const metadata = prisma.__row("card", CARD_ID)?.metadata as Record<string, unknown>;
    expect(metadata.operativo).toEqual({ scanned: true });
    const route = metadata.route as Record<string, unknown>;
    expect(route.proofs).toEqual(existingProofs);
    expect(route.otherFlag).toBe("keep-me");
    expect(route.result).toBe("ACUSE_RECIBIDO");
    expect(route.routeId).toBe(ROUTE_ID);
    expect(route.messengerId).toBe("messenger-1");
  });

  it("recomputes route status EN_PROCESO then COMPLETADA as items are checked", async () => {
    const ITEM_A = "crouteitema1";
    const ITEM_B = "crouteitemb1";
    const cardA = { id: "card-A", status: "EN_RUTA", returnReason: null, metadata: {} };
    const cardB = { id: "card-B", status: "EN_RUTA", returnReason: null, metadata: {} };
    prisma.__seed("card", cardA);
    prisma.__seed("card", cardB);
    prisma.__seed("routeItem", {
      id: ITEM_A,
      cardId: "card-A",
      routeId: ROUTE_ID,
      checkedAt: null,
      card: cardA,
      route: { messengerId: "messenger-1", messenger: null },
    });
    prisma.__seed("routeItem", {
      id: ITEM_B,
      cardId: "card-B",
      routeId: ROUTE_ID,
      checkedAt: null,
      card: cardB,
      route: { messengerId: "messenger-1", messenger: null },
    });
    prisma.__seed("route", { id: ROUTE_ID, status: "PENDIENTE" });

    const first = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_A, result: "ACUSE_RECIBIDO" }),
    );
    expect(await readJson(first)).toMatchObject({ routeStatus: "EN_PROCESO" });
    expect(prisma.__row("route", ROUTE_ID)?.status).toBe("EN_PROCESO");

    const second = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_B, result: "ACUSE_RECIBIDO" }),
    );
    expect(await readJson(second)).toMatchObject({ routeStatus: "COMPLETADA" });
    expect(prisma.__row("route", ROUTE_ID)?.status).toBe("COMPLETADA");
  });

  it("answers 404 ITEM_NOT_FOUND for an unseeded item", async () => {
    const response = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: "cmissingitem1", result: "ACUSE_RECIBIDO" }),
    );
    expect((response as Response).status).toBe(404);
    expect(await readJson(response)).toEqual({ error: "Item de ruta no encontrado" });
  });

  it("answers 400 RETURN_REASON_REQUIRED when DEVUELTA_TIENDA has no comentario or fallback reason", async () => {
    seedSingleItemRoute({ cardStatus: "EN_RUTA" });

    const response = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "DEVUELTA_TIENDA" }),
    );
    expect((response as Response).status).toBe(400);
    expect(await readJson(response)).toEqual({
      error: "Motivo de devolucion requerido para marcar tarjeta retornada",
    });
  });

  it("answers 409 CARD_CLOSED_REQUIRES_CONFIRMATION via SCAN_ITEM when the card closes between the pre-check and the transaction", async () => {
    // The SCAN_ITEM pre-check reads `route.items[].card.status` (open here);
    // `applyItemResult` re-reads the item fresh inside the transaction, where
    // the card is already closed — modelling a concurrent-request race.
    prisma.__seed("route", {
      id: ROUTE_ID,
      items: [
        {
          id: ITEM_ID,
          card: {
            id: CARD_ID,
            status: "EN_RUTA",
            tc: "TC-1",
            customer: { cedula: "001", nombre: "Juan" },
            dispatchDate: null,
            returnReason: null,
          },
        },
      ],
    });
    prisma.__seed("routeItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      routeId: ROUTE_ID,
      checkedAt: null,
      card: { id: CARD_ID, status: "RETORNADA", metadata: {}, returnReason: "ya cerrada" },
      route: { messengerId: "messenger-1", messenger: null },
    });

    const response = await patchRutas(
      patchRequest({
        action: "SCAN_ITEM",
        routeId: ROUTE_ID,
        identifier: "unused",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
      }),
    );
    expect((response as Response).status).toBe(409);
    expect(await readJson(response)).toEqual({
      error: "La tarjeta se cerro antes de actualizarla. Confirma la seleccion explicitamente.",
    });
  });
});

describe("PATCH /api/lotes — applyLotItemResult (characterization)", () => {
  // `lotItemId`/`lotId` are zod `.cuid()`-validated by the PATCH schema, so
  // these fixtures must look like cuids (start with "c", no dashes/spaces).
  const LOT_ID = "clotone1";
  const ITEM_ID = "clotitemone1";
  const CARD_ID = "lot-card-1";
  const LOT_NUMBER = "LOTE-20260801-001";

  function seedLotItem(opts: {
    cardStatus: string;
    cardReturnReason?: string | null;
    cardMetadata?: Record<string, unknown>;
    recibida?: string | null;
    retornada?: string | null;
  }) {
    const cardRow = {
      id: CARD_ID,
      status: opts.cardStatus,
      returnReason: opts.cardReturnReason ?? null,
      metadata: opts.cardMetadata ?? {},
      currentMessengerId: "messenger-1",
    };
    // Separate object instances for `card` vs `lotItem.card` — see the
    // matching comment in `seedSingleItemRoute` above for why aliasing them
    // would misrepresent `applyLotItemResult`'s `fromStatus` read order.
    prisma.__seed("card", structuredClone(cardRow));
    prisma.__seed("lotItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      lotId: LOT_ID,
      tc: "TC-9",
      recibida: opts.recibida ?? null,
      retornada: opts.retornada ?? null,
      card: structuredClone(cardRow),
      lot: { id: LOT_ID, lotNumber: LOT_NUMBER },
    });
    return cardRow;
  }

  it("marks ACUSE_RECIBIDO: recibida SI, retornada null, logs the lote-number fallback note", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    const response = await patchLotes(
      patchRequest({ action: "UPDATE_ITEM_RESULT", lotItemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );
    const body = await readJson(response);
    expect(body).toMatchObject({ updated: true, itemId: ITEM_ID, lotId: LOT_ID, tc: "TC-9" });

    expect(prisma.__row("lotItem", ITEM_ID)?.recibida).toBe("SI");
    expect(prisma.__row("lotItem", ITEM_ID)?.retornada).toBeNull();
    expect(prisma.__row("card", CARD_ID)?.status).toBe("ACUSE_RECIBIDO");
    expect(prisma.__row("card", CARD_ID)?.returnReason).toBeNull();

    const logs = prisma.__rows("cardStatusLog");
    expect(logs).toHaveLength(1);
    expect(logs[0].note).toBe(`Acuse recibido por lote ${LOT_NUMBER}`);
  });

  it("marks DEVUELTA_TIENDA with a comentario: retornada SI, returnReason set, note is the raw comentario (no prefix)", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    const response = await patchLotes(
      patchRequest({
        action: "UPDATE_ITEM_RESULT",
        lotItemId: ITEM_ID,
        result: "DEVUELTA_TIENDA",
        comentario: "paquete rechazado",
      }),
    );
    await readJson(response);

    expect(prisma.__row("lotItem", ITEM_ID)?.retornada).toBe("SI");
    expect(prisma.__row("lotItem", ITEM_ID)?.recibida).toBeNull();
    expect(prisma.__row("card", CARD_ID)?.returnReason).toBe("paquete rechazado");

    const logs = prisma.__rows("cardStatusLog");
    expect(logs).toHaveLength(1);
    // Unlike rutas, lotes uses the raw comentario as the note verbatim — no prefix.
    expect(logs[0].note).toBe("paquete rechazado");
  });

  it("suppresses the CardStatusLog row when result stays EN_RUTA, unchanged, with no comentario", async () => {
    seedLotItem({ cardStatus: "EN_RUTA", recibida: null, retornada: null });

    const response = await patchLotes(
      patchRequest({ action: "UPDATE_ITEM_RESULT", lotItemId: ITEM_ID, result: "EN_RUTA" }),
    );
    await readJson(response);

    expect(prisma.__row("lotItem", ITEM_ID)?.recibida).toBeNull();
    expect(prisma.__row("lotItem", ITEM_ID)?.retornada).toBeNull();
    expect(prisma.__rows("cardStatusLog")).toHaveLength(0);
  });

  it("preserves metadata.route.proofs and sibling metadata.operativo on merge", async () => {
    const existingProofs = [{ id: "proof-lot-1", fileUrl: "https://x/lot-proof.jpg" }];
    seedLotItem({
      cardStatus: "EN_RUTA",
      cardMetadata: {
        route: { proofs: existingProofs, otherFlag: "keep-me" },
        operativo: { scanned: true },
      },
    });

    await patchLotes(
      patchRequest({ action: "UPDATE_ITEM_RESULT", lotItemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    const metadata = prisma.__row("card", CARD_ID)?.metadata as Record<string, unknown>;
    expect(metadata.operativo).toEqual({ scanned: true });
    const route = metadata.route as Record<string, unknown>;
    expect(route.proofs).toEqual(existingProofs);
    expect(route.otherFlag).toBe("keep-me");
    expect(route.result).toBe("ACUSE_RECIBIDO");
    expect(route.lotId).toBe(LOT_ID);
  });

  it("answers 404 LOT_ITEM_NOT_FOUND for an unseeded item", async () => {
    const response = await patchLotes(
      patchRequest({ action: "UPDATE_ITEM_RESULT", lotItemId: "cmissinglotitem1", result: "ACUSE_RECIBIDO" }),
    );
    expect((response as Response).status).toBe(404);
    expect(await readJson(response)).toEqual({ error: "Item de lote no encontrado" });
  });

  it("answers 400 RETURN_REASON_REQUIRED when DEVUELTA_TIENDA has no comentario or fallback reason", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    const response = await patchLotes(
      patchRequest({ action: "UPDATE_ITEM_RESULT", lotItemId: ITEM_ID, result: "DEVUELTA_TIENDA" }),
    );
    expect((response as Response).status).toBe(400);
    expect(await readJson(response)).toEqual({
      error: "Motivo de devolucion requerido para marcar tarjeta devuelta a tienda",
    });
  });

  it("answers 409 CARD_CLOSED_REQUIRES_CONFIRMATION via SCAN_ITEM when the card closes between the pre-check and the transaction", async () => {
    prisma.__seed("lot", {
      id: LOT_ID,
      items: [
        {
          id: ITEM_ID,
          cardId: CARD_ID,
          tc: "TC-9",
          cedula: "001",
          card: { id: CARD_ID, status: "EN_RUTA", customer: { nombre: "Juan" }, dispatchDate: null, returnReason: null },
        },
      ],
    });
    prisma.__seed("lotItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      lotId: LOT_ID,
      tc: "TC-9",
      recibida: null,
      retornada: null,
      card: { id: CARD_ID, status: "RETORNADA", metadata: {}, returnReason: "ya cerrada" },
      lot: { id: LOT_ID, lotNumber: LOT_NUMBER },
    });

    const response = await patchLotes(
      patchRequest({
        action: "SCAN_ITEM",
        lotId: LOT_ID,
        identifier: "unused",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
      }),
    );
    expect((response as Response).status).toBe(409);
    expect(await readJson(response)).toEqual({
      error: "La tarjeta se cerro antes de actualizarla. Confirma la seleccion explicitamente.",
    });
  });
});

describe("Card.metadata.route.proofs stays byte-identical through the mobile read (task 1.3)", () => {
  // `ITEM_ID` is passed as the zod `.cuid()`-validated `itemId` on the PATCH.
  const ROUTE_ID = "cmobilerouteone1";
  const ITEM_ID = "cmobileitemone1";
  const CARD_ID = "mobile-card-1";

  it("keeps proofs untouched by app/api/mobile/rutas/route.ts GET after an unrelated applyItemResult write", async () => {
    const proof = {
      id: "proof-mobile-1",
      routeId: ROUTE_ID,
      itemId: ITEM_ID,
      messengerId: "messenger-1",
      byUserId: "user-1",
      fileUrl: "https://x/mobile-proof.jpg",
      filePath: "/x/mobile-proof.jpg",
      mimeType: "image/jpeg",
      size: 4096,
      note: "entregado en mano",
      createdAt: "2026-08-01T00:00:00.000Z",
    };

    // `metadata.operativo` is a ROOT sibling of `metadata.route` (see
    // `app/api/operativo/contacto/route.ts`'s `asRecord(metadataRoot.operativo)`),
    // not nested inside it.
    const cardTableRow: Record<string, unknown> = {
      id: CARD_ID,
      status: "EN_RUTA",
      returnReason: null,
      dispatchOrigin: "BODEGA",
      tc: "TC-MOBILE-1",
      customer: { cedula: "009", nombre: "Ana" },
      metadata: {
        route: { proofs: [proof] },
        operativo: { scanned: true },
      },
    };

    // `card` (the row `tx.card.update` mutates) and `route.items[].card` (what
    // the mobile GET's `route.findMany` reads) are the SAME reference here —
    // that mirrors a real DB read-after-write through one source-of-truth row.
    // `routeItem.card` — the snapshot `applyItemResult`'s own
    // `tx.routeItem.findUnique` reads BEFORE the update — is a separate clone,
    // matching how a real Prisma `findUnique` never gets mutated by a later
    // `update()` call.
    prisma.__seed("card", cardTableRow as { id: string });
    prisma.__seed("routeItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      routeId: ROUTE_ID,
      checkedAt: null,
      card: structuredClone(cardTableRow),
      route: { messengerId: "messenger-1", messenger: { nombre: "Pedro Gonzalez" } },
    });
    prisma.__seed("route", {
      id: ROUTE_ID,
      messengerId: "messenger-1",
      status: "PENDIENTE",
      items: [{ id: ITEM_ID, sequence: 1, checkedAt: null, card: cardTableRow }],
    });

    await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    // The write did change `metadata.route.result`, proving the merge ran.
    expect((prisma.__row("card", CARD_ID)?.metadata as Record<string, unknown>)).toMatchObject({
      route: expect.objectContaining({ result: "ACUSE_RECIBIDO" }),
    });

    const mobileResponse = await getMobileRutas(mobileReq("/api/mobile/rutas?messengerId=messenger-1"));
    const mobileBody = await readJson(mobileResponse);
    const routes = mobileBody.routes as Array<{ items: Array<{ proofs: unknown[] }> }>;

    expect(routes).toHaveLength(1);
    expect(routes[0].items).toHaveLength(1);
    // Byte-identical shape: same key set, same values, still filtered by
    // routeId/itemId — untouched by the unrelated `result`/`comentario` merge.
    expect(routes[0].items[0].proofs).toEqual([proof]);
    expect((prisma.__row("card", CARD_ID)?.metadata as Record<string, unknown>).operativo).toEqual({
      scanned: true,
    });
  });
});

/**
 * SDD contrato-tarjetas-pistoleo — Phase 6, task 6.4.
 *
 * Appended describe block ONLY — every `it(...)` above stays byte-unchanged
 * (design D4). All existing seeds above omit `hasContract`/`contractImageAt`,
 * which default falsy, so their `ACUSE_RECIBIDO` outcomes above already prove
 * `hasContract=false` cards land on the byte-identical pre-existing status —
 * this block adds the explicit `hasContract=true` divergence coverage.
 */
describe("contract exception (hasContract)", () => {
  const ROUTE_ID = "croutecontract1";
  const ITEM_ID = "critemcontract1";
  const CARD_ID = "ccardcontract01";

  function seedContractRoute(opts: { hasContract: boolean; contractImageAt?: Date | null }) {
    const cardRow = {
      id: CARD_ID,
      status: "EN_RUTA",
      returnReason: null,
      metadata: {},
      currentMessengerId: null,
      hasContract: opts.hasContract,
      contractImageAt: opts.contractImageAt ?? null,
      customer: { cedula: "cedula-contract-1", nombre: "Cliente Contrato" },
    };
    prisma.__seed("card", structuredClone(cardRow));
    prisma.__seed("routeItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      routeId: ROUTE_ID,
      checkedAt: null,
      card: structuredClone(cardRow),
      route: { messengerId: "messenger-1", messenger: { nombre: "Pedro Gonzalez" } },
    });
    prisma.__seed("route", { id: ROUTE_ID, status: "PENDIENTE" });
  }

  it("hasContract=false: ACUSE_RECIBIDO delivers exactly as before, no warning, no confirmation needed", async () => {
    seedContractRoute({ hasContract: false });

    const response = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(200);
    expect(body).toMatchObject({ updated: true, cardId: CARD_ID });
    expect(prisma.__row("card", CARD_ID)?.status).toBe("ACUSE_RECIBIDO");
  });

  it("hasContract=true, no contract image, ACUSE_RECIBIDO without confirmMissingContract: 409 SIN_CONTRATO_REQUIERE_CONFIRMACION, no status write", async () => {
    seedContractRoute({ hasContract: true });

    const response = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(409);
    expect(body).toMatchObject({ kind: "SIN_CONTRATO_REQUIERE_CONFIRMACION" });
    expect(prisma.__row("card", CARD_ID)?.status).toBe("EN_RUTA");
  });

  it("hasContract=true, confirmMissingContract=true: card diverges to ENTREGA_SIN_CONTRATO instead of ACUSE_RECIBIDO", async () => {
    seedContractRoute({ hasContract: true });

    const response = await patchRutas(
      patchRequest({
        action: "UPDATE_ITEM_RESULT",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
        confirmMissingContract: true,
      }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(200);
    expect(body).toMatchObject({ updated: true, cardId: CARD_ID });
    expect(prisma.__row("card", CARD_ID)?.status).toBe("ENTREGA_SIN_CONTRATO");
    expect(prisma.__row("routeItem", ITEM_ID)?.outcome).toBe("ACUSE_RECIBIDO");
  });

  it("hasContract=true but contractImageAt already set: delivers ACUSE_RECIBIDO normally, no warning", async () => {
    seedContractRoute({ hasContract: true, contractImageAt: new Date("2026-08-20T10:00:00.000Z") });

    const response = await patchRutas(
      patchRequest({ action: "UPDATE_ITEM_RESULT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    expect((response as Response).status).toBe(200);
    expect(prisma.__row("card", CARD_ID)?.status).toBe("ACUSE_RECIBIDO");
  });

  it("hasContract=true, no contract image, RETORNADA outcome: no warning at all, follows the existing DEVUELTA_TIENDA mapping unchanged", async () => {
    seedContractRoute({ hasContract: true });

    const response = await patchRutas(
      patchRequest({
        action: "UPDATE_ITEM_RESULT",
        itemId: ITEM_ID,
        result: "RETORNADA",
        comentario: "no encontrado",
      }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(200);
    expect(prisma.__row("card", CARD_ID)?.status).toBe("DEVUELTA_TIENDA");
  });
});
