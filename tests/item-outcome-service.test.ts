import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionalPrismaMock } from "./golden/helpers/mock-route";

/**
 * SDD change `rutas-lotes-redesign` — Slice 4a (task 4.2).
 *
 * `lib/item-outcome-service.ts` is the shared, tx-bound write service both
 * `applyItemResult` (rutas) and `applyLotItemResult` (lotes) will delegate
 * to in Slice 4b. It is NOT wired into either handler in this batch — this
 * suite tests it standalone, directly (unlike Slice 1's characterization
 * suite, which had to go through the exported `PATCH` handler because
 * Next.js route.ts files reject non-HTTP named exports; `applyItemOutcome`
 * has no such restriction).
 *
 * Every scenario mirrors a Slice-1 characterization case so Slice 4b's
 * eventual handler delegation has zero behavioral drift to reconcile, PLUS
 * new scenarios for this batch's additions: typed-column dual-write for
 * `outcome`/`outcomeReason`/`outcomeAt` (RouteItem) and `outcome`/`outcomeReason`
 * (LotItem), and the SHADOW-mode `CardTransitionPolicy` consultation — this
 * change's FIRST live call site for that policy.
 */

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock: create } = await import("./golden/helpers/mock-route");
  return { prisma: create() };
});

vi.mock("@/lib/urgent-alerts", () => ({
  classifyCardLifecycle: vi.fn(() => "ACTIVE"),
  clearUrgencyOnCardClosure: vi.fn(async () => undefined),
  parkUrgencyOnPendingReception: vi.fn(async () => undefined),
}));

vi.mock("@/lib/card-transition-policy-store", () => ({
  getCardTransitionPolicyMode: vi.fn(async () => "SHADOW"),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { getCardTransitionPolicyMode } from "@/lib/card-transition-policy-store";
import {
  applyItemOutcome,
  CARD_CLOSED_REQUIRES_CONFIRMATION,
  ITEM_NOT_FOUND,
  LOT_ITEM_NOT_FOUND,
} from "@/lib/item-outcome-service";
import { RETURN_REASON_REQUIRED } from "@/lib/item-outcome";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const mockedGetMode = vi.mocked(getCardTransitionPolicyMode);

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
  mockedGetMode.mockResolvedValue("SHADOW");
});

function run<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
  const transact = prisma.$transaction as unknown as (
    callback: (tx: unknown) => Promise<T>,
  ) => Promise<T>;
  return transact(fn);
}

describe("applyItemOutcome — ROUTE domain", () => {
  const ROUTE_ID = "route-1";
  const ITEM_ID = "route-item-1";
  const CARD_ID = "route-card-1";

  function seedRouteItem(opts: {
    cardStatus: string;
    cardReturnReason?: string | null;
    cardMetadata?: Record<string, unknown>;
    checkedAt?: Date | null;
    messengerName?: string | null;
  }) {
    const cardRow = {
      id: CARD_ID,
      tc: "TC-ROUTE-1",
      status: opts.cardStatus,
      returnReason: opts.cardReturnReason ?? null,
      metadata: opts.cardMetadata ?? {},
      currentMessengerId: null,
      digitalDeliveryCycle: 0,
    };
    // Separate object instances for `card` vs `routeItem.card`, matching
    // Slice 1's harness: a real Prisma `update()` never mutates a row a
    // prior `findUnique()` already returned.
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

  it("marks ACUSE_RECIBIDO: sets checkedAt, nulls returnReason, logs with mensajero note, dual-writes outcome/outcomeReason/outcomeAt", async () => {
    seedRouteItem({ cardStatus: "EN_RUTA", messengerName: "Pedro Gonzalez" });

    const result = await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "ROUTE",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
        byUserId: "user-1",
      }),
    );

    expect(result).toMatchObject({
      itemId: ITEM_ID,
      cardId: CARD_ID,
      routeId: ROUTE_ID,
      routeStatus: "COMPLETADA",
      outcome: "ACUSE_RECIBIDO",
    });

    const itemRow = prisma.__row("routeItem", ITEM_ID);
    expect(itemRow?.checkedAt).toBeInstanceOf(Date);
    expect(itemRow?.outcome).toBe("ACUSE_RECIBIDO");
    expect(itemRow?.outcomeReason).toBeNull();
    expect(itemRow?.outcomeAt).toBeInstanceOf(Date);

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

  it("marks DEVUELTA_TIENDA with a comentario: sets returnReason, dual-writes outcomeReason, appends the comentario to the note", async () => {
    seedRouteItem({ cardStatus: "EN_RUTA", messengerName: "Pedro Gonzalez" });

    const result = await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "ROUTE",
        itemId: ITEM_ID,
        result: "DEVUELTA_TIENDA",
        comentario: "direccion incorrecta",
        byUserId: "user-1",
      }),
    );

    expect(result.outcome).toBe("DEVUELTA_TIENDA");
    const cardRow = prisma.__row("card", CARD_ID);
    expect(cardRow?.status).toBe("DEVUELTA_TIENDA");
    expect(cardRow?.returnReason).toBe("direccion incorrecta");

    const itemRow = prisma.__row("routeItem", ITEM_ID);
    expect(itemRow?.outcomeReason).toBe("direccion incorrecta");

    const logs = prisma.__rows("cardStatusLog");
    expect(logs[0].note).toBe("Tarjeta devuelta a tienda por mensajero Pedro Gonzalez: direccion incorrecta");
  });

  it("suppresses the CardStatusLog row when result stays EN_RUTA, unchanged, with no comentario", async () => {
    seedRouteItem({
      cardStatus: "EN_RUTA",
      messengerName: "Pedro Gonzalez",
      checkedAt: new Date("2026-08-20T10:00:00.000Z"),
    });

    const result = await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "ROUTE", itemId: ITEM_ID, result: "EN_RUTA" }),
    );

    expect(result.routeStatus).toBe("PENDIENTE");
    expect(prisma.__row("routeItem", ITEM_ID)?.checkedAt).toBeNull();
    expect(prisma.__row("card", CARD_ID)?.status).toBe("EN_RUTA");
    expect(prisma.__rows("cardStatusLog")).toHaveLength(0);
  });

  it("preserves metadata.route.proofs and sibling metadata.operativo on merge", async () => {
    const existingProofs = [{ id: "proof-1", fileUrl: "https://x/proof.jpg" }];
    seedRouteItem({
      cardStatus: "EN_RUTA",
      messengerName: "Pedro Gonzalez",
      cardMetadata: {
        route: { proofs: existingProofs, otherFlag: "keep-me" },
        operativo: { scanned: true },
      },
    });

    await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "ROUTE", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    const metadata = prisma.__row("card", CARD_ID)?.metadata as Record<string, unknown>;
    expect(metadata.operativo).toEqual({ scanned: true });
    const route = metadata.route as Record<string, unknown>;
    expect(route.proofs).toEqual(existingProofs);
    expect(route.otherFlag).toBe("keep-me");
    expect(route.result).toBe("ACUSE_RECIBIDO");
  });

  it("throws ITEM_NOT_FOUND for an unseeded item", async () => {
    await expect(
      run((tx) =>
        applyItemOutcome({ tx: tx as never, domain: "ROUTE", itemId: "missing", result: "ACUSE_RECIBIDO" }),
      ),
    ).rejects.toThrowError(ITEM_NOT_FOUND);
  });

  it("throws RETURN_REASON_REQUIRED for DEVUELTA_TIENDA with no comentario or fallback reason", async () => {
    seedRouteItem({ cardStatus: "EN_RUTA" });

    await expect(
      run((tx) =>
        applyItemOutcome({ tx: tx as never, domain: "ROUTE", itemId: ITEM_ID, result: "DEVUELTA_TIENDA" }),
      ),
    ).rejects.toThrowError(RETURN_REASON_REQUIRED);
  });

  it("throws CARD_CLOSED_REQUIRES_CONFIRMATION when requireOpenCard is set and the card is already closed", async () => {
    seedRouteItem({ cardStatus: "RETORNADA" });

    await expect(
      run((tx) =>
        applyItemOutcome({
          tx: tx as never,
          domain: "ROUTE",
          itemId: ITEM_ID,
          result: "ACUSE_RECIBIDO",
          requireOpenCard: true,
        }),
      ),
    ).rejects.toThrowError(CARD_CLOSED_REQUIRES_CONFIRMATION);
  });

  it("returns a null observation for an ALLOWED edge (EN_RUTA -> ACUSE_RECIBIDO) under SHADOW mode", async () => {
    seedRouteItem({ cardStatus: "EN_RUTA" });
    mockedGetMode.mockResolvedValue("SHADOW");

    const result = await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "ROUTE", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    expect(result.observation).toBeNull();
  });

  it("sets RouteItem.outcomeAt on every write, including a revert to EN_RUTA (chosen semantics: unconditional last-write timestamp, pinned for Slice 4b)", async () => {
    seedRouteItem({
      cardStatus: "EN_RUTA",
      messengerName: "Pedro Gonzalez",
      checkedAt: new Date("2026-08-20T10:00:00.000Z"),
    });

    const result = await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "ROUTE", itemId: ITEM_ID, result: "EN_RUTA" }),
    );

    expect(result.routeStatus).toBe("PENDIENTE");
    expect(prisma.__row("routeItem", ITEM_ID)?.checkedAt).toBeNull();
    expect(prisma.__row("routeItem", ITEM_ID)?.outcomeAt).toBeInstanceOf(Date);
  });

  it("does not upsert CardTcGuard for any of the three possible outcomes — none is a terminal CardStatus (design delta #1 is inert on this call path today)", async () => {
    seedRouteItem({ cardStatus: "EN_RUTA", messengerName: "Pedro Gonzalez" });

    await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "ROUTE",
        itemId: ITEM_ID,
        result: "DEVUELTA_TIENDA",
        comentario: "direccion incorrecta",
      }),
    );

    expect(prisma.cardTcGuard.upsert).not.toHaveBeenCalled();
  });

  it("returns a populated observation for an UNLISTED edge under SHADOW mode, without blocking the write", async () => {
    seedRouteItem({ cardStatus: "DEVUELTA_TIENDA" });
    mockedGetMode.mockResolvedValue("SHADOW");

    const result = await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "ROUTE",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
        requireOpenCard: false,
      }),
    );

    // Write still succeeded — SHADOW mode never rejects.
    expect(prisma.__row("card", CARD_ID)?.status).toBe("ACUSE_RECIBIDO");
    expect(result.observation).toMatchObject({
      domain: "ROUTE",
      itemId: ITEM_ID,
      cardId: CARD_ID,
      edge: { from: "DEVUELTA_TIENDA", to: "ACUSE_RECIBIDO" },
      mode: "SHADOW",
    });
    expect(result.observation?.evaluation).toMatchObject({ allowed: false, reason: "UNLISTED_EDGE" });
  });

  it("returns a null observation when policy mode is OFF, even for an UNLISTED edge", async () => {
    seedRouteItem({ cardStatus: "DEVUELTA_TIENDA" });
    mockedGetMode.mockResolvedValue("OFF");

    const result = await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "ROUTE",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
        requireOpenCard: false,
      }),
    );

    expect(result.observation).toBeNull();
  });
});

describe("applyItemOutcome — LOT domain", () => {
  const LOT_ID = "lot-1";
  const ITEM_ID = "lot-item-1";
  const CARD_ID = "lot-card-1";
  const LOT_NUMBER = "LOTE-20260801-001";

  function seedLotItem(opts: {
    cardStatus: string;
    cardReturnReason?: string | null;
    cardMetadata?: Record<string, unknown>;
    recibida?: string | null;
    retornada?: string | null;
    withoutCard?: boolean;
  }) {
    const cardRow = opts.withoutCard
      ? null
      : {
          id: CARD_ID,
          tc: "TC-LOT-1",
          status: opts.cardStatus,
          returnReason: opts.cardReturnReason ?? null,
          metadata: opts.cardMetadata ?? {},
          currentMessengerId: "messenger-1",
          digitalDeliveryCycle: 0,
        };
    if (cardRow) prisma.__seed("card", structuredClone(cardRow));
    prisma.__seed("lotItem", {
      id: ITEM_ID,
      cardId: cardRow ? CARD_ID : null,
      lotId: LOT_ID,
      tc: "TC-9",
      recibida: opts.recibida ?? null,
      retornada: opts.retornada ?? null,
      card: cardRow ? structuredClone(cardRow) : null,
      lot: { id: LOT_ID, lotNumber: LOT_NUMBER },
    });
    return cardRow;
  }

  it("marks ACUSE_RECIBIDO: recibida SI + recibidaAt set, dual-writes outcome, logs the lote-number fallback note", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    const result = await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "LOT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    expect(result).toMatchObject({ itemId: ITEM_ID, lotId: LOT_ID, cardId: CARD_ID, outcome: "ACUSE_RECIBIDO" });

    const itemRow = prisma.__row("lotItem", ITEM_ID);
    expect(itemRow?.recibida).toBe("SI");
    expect(itemRow?.retornada).toBeNull();
    expect(itemRow?.recibidaAt).toBeInstanceOf(Date);
    expect(itemRow?.outcome).toBe("ACUSE_RECIBIDO");
    expect(itemRow?.outcomeReason).toBeNull();

    expect(prisma.__row("card", CARD_ID)?.status).toBe("ACUSE_RECIBIDO");

    const logs = prisma.__rows("cardStatusLog");
    expect(logs).toHaveLength(1);
    expect(logs[0].note).toBe(`Acuse recibido por lote ${LOT_NUMBER}`);
  });

  it("marks DEVUELTA_TIENDA with a comentario: retornada SI + retornadaAt set, note is the raw comentario (no prefix)", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "LOT",
        itemId: ITEM_ID,
        result: "DEVUELTA_TIENDA",
        comentario: "paquete rechazado",
      }),
    );

    const itemRow = prisma.__row("lotItem", ITEM_ID);
    expect(itemRow?.retornada).toBe("SI");
    expect(itemRow?.recibida).toBeNull();
    expect(itemRow?.retornadaAt).toBeInstanceOf(Date);
    expect(itemRow?.outcomeReason).toBe("paquete rechazado");
    expect(prisma.__row("card", CARD_ID)?.returnReason).toBe("paquete rechazado");

    const logs = prisma.__rows("cardStatusLog");
    expect(logs[0].note).toBe("paquete rechazado");
  });

  it("suppresses the CardStatusLog row when result stays EN_RUTA, unchanged, with no comentario", async () => {
    seedLotItem({ cardStatus: "EN_RUTA", recibida: null, retornada: null });

    await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "LOT", itemId: ITEM_ID, result: "EN_RUTA" }),
    );

    expect(prisma.__row("lotItem", ITEM_ID)?.recibida).toBeNull();
    expect(prisma.__rows("cardStatusLog")).toHaveLength(0);
  });

  it("preserves metadata.route.proofs and sibling metadata.operativo on merge", async () => {
    const existingProofs = [{ id: "proof-lot-1", fileUrl: "https://x/lot-proof.jpg" }];
    seedLotItem({
      cardStatus: "EN_RUTA",
      cardMetadata: { route: { proofs: existingProofs, otherFlag: "keep-me" }, operativo: { scanned: true } },
    });

    await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "LOT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    const metadata = prisma.__row("card", CARD_ID)?.metadata as Record<string, unknown>;
    expect(metadata.operativo).toEqual({ scanned: true });
    const route = metadata.route as Record<string, unknown>;
    expect(route.proofs).toEqual(existingProofs);
    expect(route.otherFlag).toBe("keep-me");
    expect(route.result).toBe("ACUSE_RECIBIDO");
    expect(route.lotId).toBe(LOT_ID);
  });

  it("echoes tc on the response, matching applyLotItemResult's legacy response shape (design gap #2, closed for Slice 4b)", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    const result = await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "LOT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    expect(result.tc).toBe("TC-9");
  });

  it("throws LOT_ITEM_NOT_FOUND for an unseeded item", async () => {
    await expect(
      run((tx) =>
        applyItemOutcome({ tx: tx as never, domain: "LOT", itemId: "missing", result: "ACUSE_RECIBIDO" }),
      ),
    ).rejects.toThrowError(LOT_ITEM_NOT_FOUND);
  });

  it("throws RETURN_REASON_REQUIRED for DEVUELTA_TIENDA with no comentario or fallback reason", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    await expect(
      run((tx) => applyItemOutcome({ tx: tx as never, domain: "LOT", itemId: ITEM_ID, result: "DEVUELTA_TIENDA" })),
    ).rejects.toThrowError(RETURN_REASON_REQUIRED);
  });

  it("throws CARD_CLOSED_REQUIRES_CONFIRMATION when requireOpenCard is set and the card is already closed", async () => {
    seedLotItem({ cardStatus: "RETORNADA" });

    await expect(
      run((tx) =>
        applyItemOutcome({
          tx: tx as never,
          domain: "LOT",
          itemId: ITEM_ID,
          result: "ACUSE_RECIBIDO",
          requireOpenCard: true,
        }),
      ),
    ).rejects.toThrowError(CARD_CLOSED_REQUIRES_CONFIRMATION);
  });

  it("only writes the LotItem when it has no linked card — no card transition, no log row, null observation", async () => {
    seedLotItem({ cardStatus: "EN_RUTA", withoutCard: true });

    const result = await run((tx) =>
      applyItemOutcome({ tx: tx as never, domain: "LOT", itemId: ITEM_ID, result: "ACUSE_RECIBIDO" }),
    );

    expect(result).toMatchObject({ itemId: ITEM_ID, lotId: LOT_ID, cardId: null, outcome: "ACUSE_RECIBIDO" });
    expect(prisma.__row("lotItem", ITEM_ID)?.recibida).toBe("SI");
    expect(prisma.__rows("cardStatusLog")).toHaveLength(0);
    expect(result.observation).toBeNull();
  });

  it("returns a populated observation for an UNLISTED edge under SHADOW mode when a card IS linked", async () => {
    seedLotItem({ cardStatus: "DEVUELTA_TIENDA" });
    mockedGetMode.mockResolvedValue("SHADOW");

    const result = await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "LOT",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
        requireOpenCard: false,
      }),
    );

    expect(result.observation).toMatchObject({
      domain: "LOT",
      edge: { from: "DEVUELTA_TIENDA", to: "ACUSE_RECIBIDO" },
      mode: "SHADOW",
    });
  });
});

/**
 * SDD contrato-tarjetas-pistoleo — Phase 3, task 3.3/6.3.
 *
 * `deliveredWithoutContract` diverges ONLY the ROUTE-domain ACUSE_RECIBIDO
 * card-status write to `ENTREGA_SIN_CONTRATO`. `RouteItem.outcome` stays
 * `ACUSE_RECIBIDO` (design D3) — `lib/item-outcome.ts::outcomeToCardStatus`
 * is untouched, the branch lives in the caller.
 */
describe("applyItemOutcome — deliveredWithoutContract (contract exception)", () => {
  const ROUTE_ID = "route-contract-1";
  const ITEM_ID = "route-item-contract-1";
  const CARD_ID = "route-card-contract-1";

  function seedRouteItem(opts: { cardStatus: string }) {
    const cardRow = {
      id: CARD_ID,
      tc: "TC-CONTRACT-1",
      status: opts.cardStatus,
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
      route: { messengerId: "messenger-1", messenger: { nombre: "Pedro Gonzalez" } },
    });
    prisma.__seed("route", { id: ROUTE_ID, status: "PENDIENTE" });
  }

  it("diverges nextStatus to ENTREGA_SIN_CONTRATO when deliveredWithoutContract is true and outcome is ACUSE_RECIBIDO", async () => {
    seedRouteItem({ cardStatus: "EN_RUTA" });

    const result = await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "ROUTE",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
        byUserId: "user-1",
        deliveredWithoutContract: true,
      }),
    );

    expect(result.outcome).toBe("ACUSE_RECIBIDO");
    expect(prisma.__row("card", CARD_ID)?.status).toBe("ENTREGA_SIN_CONTRATO");
    expect(prisma.__row("routeItem", ITEM_ID)?.outcome).toBe("ACUSE_RECIBIDO");
  });

  it("does NOT diverge nextStatus for a non-delivered outcome even when deliveredWithoutContract is true", async () => {
    seedRouteItem({ cardStatus: "EN_RUTA" });

    await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "ROUTE",
        itemId: ITEM_ID,
        result: "RETORNADA",
        byUserId: "user-1",
        deliveredWithoutContract: true,
        comentario: "no encontrado",
      }),
    );

    expect(prisma.__row("card", CARD_ID)?.status).toBe("DEVUELTA_TIENDA");
  });

  it("keeps the normal ACUSE_RECIBIDO status when deliveredWithoutContract is false/absent", async () => {
    seedRouteItem({ cardStatus: "EN_RUTA" });

    await run((tx) =>
      applyItemOutcome({
        tx: tx as never,
        domain: "ROUTE",
        itemId: ITEM_ID,
        result: "ACUSE_RECIBIDO",
        byUserId: "user-1",
      }),
    );

    expect(prisma.__row("card", CARD_ID)?.status).toBe("ACUSE_RECIBIDO");
  });
});
