import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJson, type TransactionalPrismaMock } from "./helpers/mock-route";

/**
 * SDD change `rutas-lotes-redesign` — Slice 3 (tasks 3.1/3.3/3.5).
 *
 * Dual-write coverage for the new typed `Lot.estatusTipo` and
 * `LotItem.recibidaAt`/`retornadaAt` columns added in this slice. Every
 * current writer of `Lot.estatus`/`LotItem.recibida`/`LotItem.retornada`
 * must also populate the typed mirror going forward (nullable, additive;
 * the legacy fields keep being written unchanged). Unmapped free-text
 * `estatus` values are report-and-skip: the typed column stays null, the
 * write still succeeds.
 *
 * Kept in its OWN file, separate from
 * `tests/golden/route-lot-outcome-characterization.test.ts`, so that
 * pre-existing characterization suite stays byte-for-byte unchanged (the
 * safety-net requirement for this batch).
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

import { prisma as prismaImport } from "@/lib/prisma";
import { PATCH as patchLotes, POST as postLotes } from "@/app/api/lotes/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;

function req(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("applyLotItemResult dual-writes LotItem.recibidaAt/retornadaAt (task 3.3)", () => {
  const LOT_ID = "clotone1";
  const ITEM_ID = "clotitemone1";
  const CARD_ID = "lot-card-1";
  const LOT_NUMBER = "LOTE-20260801-001";

  function seedLotItem(opts: {
    cardStatus: string;
    recibida?: string | null;
    retornada?: string | null;
    recibidaAt?: Date | null;
    retornadaAt?: Date | null;
  }) {
    const cardRow = {
      id: CARD_ID,
      status: opts.cardStatus,
      returnReason: null,
      metadata: {},
      currentMessengerId: "messenger-1",
    };
    prisma.__seed("card", structuredClone(cardRow));
    prisma.__seed("lotItem", {
      id: ITEM_ID,
      cardId: CARD_ID,
      lotId: LOT_ID,
      tc: "TC-9",
      recibida: opts.recibida ?? null,
      retornada: opts.retornada ?? null,
      recibidaAt: opts.recibidaAt ?? null,
      retornadaAt: opts.retornadaAt ?? null,
      card: structuredClone(cardRow),
      lot: { id: LOT_ID, lotNumber: LOT_NUMBER },
    });
  }

  it("ACUSE_RECIBIDO sets recibidaAt to a Date and leaves retornadaAt null", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    await patchLotes(req({ action: "UPDATE_ITEM_RESULT", lotItemId: ITEM_ID, result: "ACUSE_RECIBIDO" }));

    const row = prisma.__row("lotItem", ITEM_ID);
    expect(row?.recibida).toBe("SI");
    expect(row?.recibidaAt).toBeInstanceOf(Date);
    expect(row?.retornada).toBeNull();
    expect(row?.retornadaAt).toBeNull();
  });

  it("DEVUELTA_TIENDA sets retornadaAt to a Date and leaves recibidaAt null", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    await patchLotes(
      req({
        action: "UPDATE_ITEM_RESULT",
        lotItemId: ITEM_ID,
        result: "DEVUELTA_TIENDA",
        comentario: "paquete rechazado",
      }),
    );

    const row = prisma.__row("lotItem", ITEM_ID);
    expect(row?.retornada).toBe("SI");
    expect(row?.retornadaAt).toBeInstanceOf(Date);
    expect(row?.recibida).toBeNull();
    expect(row?.recibidaAt).toBeNull();
  });

  it("EN_RUTA leaves both typed columns null (no-op transition)", async () => {
    seedLotItem({ cardStatus: "EN_RUTA" });

    await patchLotes(req({ action: "UPDATE_ITEM_RESULT", lotItemId: ITEM_ID, result: "EN_RUTA" }));

    const row = prisma.__row("lotItem", ITEM_ID);
    expect(row?.recibidaAt).toBeNull();
    expect(row?.retornadaAt).toBeNull();
  });

  it("transitioning back to EN_RUTA clears a previously set recibidaAt back to null, mirroring recibida", async () => {
    seedLotItem({
      cardStatus: "ACUSE_RECIBIDO",
      recibida: "SI",
      recibidaAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    await patchLotes(req({ action: "UPDATE_ITEM_RESULT", lotItemId: ITEM_ID, result: "EN_RUTA" }));

    const row = prisma.__row("lotItem", ITEM_ID);
    expect(row?.recibida).toBeNull();
    expect(row?.recibidaAt).toBeNull();
  });
});

describe("Lot.estatusTipo dual-write on creation (task 3.3, POST /api/lotes)", () => {
  const MESSENGER_ID = "cmessengerone1";

  beforeEach(() => {
    prisma.__seed("messenger", { id: MESSENGER_ID, nombre: "Pedro Gonzalez" });
  });

  it("maps the default 'EN TRANSITO' estatus to estatusTipo EN_TRANSITO", async () => {
    const response = await postLotes(
      req({
        messengerId: MESSENGER_ID,
        sentTo: "Santiago",
        fechaEnvio: "2026-08-29",
        identifiers: ["TC-NOT-FOUND-1"],
      }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(201);
    const lot = body.lot as Record<string, unknown>;
    expect(lot.estatus).toBe("EN TRANSITO");
    expect(lot.estatusTipo).toBe("EN_TRANSITO");
  });

  it("report-and-skip: an unmapped explicit estatus leaves estatusTipo null without throwing", async () => {
    const response = await postLotes(
      req({
        messengerId: MESSENGER_ID,
        sentTo: "Santiago",
        fechaEnvio: "2026-08-29",
        estatus: "RECIBIDO EN BANCO",
        identifiers: ["TC-NOT-FOUND-2"],
      }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(201);
    const lot = body.lot as Record<string, unknown>;
    expect(lot.estatus).toBe("RECIBIDO EN BANCO");
    expect(lot.estatusTipo).toBeNull();
  });
});

describe("Lot.estatusTipo dual-write on UPDATE_LOT_STATUS (task 3.3, PATCH /api/lotes)", () => {
  const LOT_ID = "clotstatusone1";

  beforeEach(() => {
    prisma.__seed("lot", { id: LOT_ID, estatus: "EN TRANSITO", estatusTipo: "EN_TRANSITO" });
  });

  it("maps a recognized estatus to the typed column", async () => {
    const response = await patchLotes(
      req({ action: "UPDATE_LOT_STATUS", lotId: LOT_ID, estatus: "PENDIENTE" }),
    );
    const body = await readJson(response);

    const lot = body.lot as Record<string, unknown>;
    expect(lot.estatus).toBe("PENDIENTE");
    expect(lot.estatusTipo).toBe("PENDIENTE");
  });

  it("report-and-skip: an unmapped estatus nulls the typed column without throwing", async () => {
    const response = await patchLotes(
      req({ action: "UPDATE_LOT_STATUS", lotId: LOT_ID, estatus: "CERRADO MANUALMENTE" }),
    );
    const body = await readJson(response);

    const lot = body.lot as Record<string, unknown>;
    expect(lot.estatus).toBe("CERRADO MANUALMENTE");
    expect(lot.estatusTipo).toBeNull();
  });
});
