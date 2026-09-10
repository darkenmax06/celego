import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardStatus, CardProductType, DispatchOrigin } from "@prisma/client";
import { createTransactionalPrismaMock, type TransactionalPrismaMock } from "./golden/helpers/mock-route";

/**
 * Reproduction for the reported bug: re-importing a Debito Consolidado file
 * or a Pinit export re-touches every matched card on every run. When a row's
 * status has not actually moved, applyCardTransition must not write a
 * CardStatusLog row — its guard is `card.status !== nextStatus || note`, and
 * both import paths used to pass a near-constant note on every call, so the
 * `|| note` branch fired regardless of whether anything changed.
 */

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("./golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});
vi.mock("@/lib/urgent-alerts", () => ({
  classifyCardLifecycle: vi.fn(() => "ACTIVE"),
  clearUrgencyOnCardClosure: vi.fn(async () => undefined),
  parkUrgencyOnPendingReception: vi.fn(async () => undefined),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { persistDebitConsolidadoImport, updateCardsFromPinitExport } from "@/lib/card-service";

const prisma = prismaImport as unknown as TransactionalPrismaMock;

/** customer.upsert has no default in the shared mock; give it real semantics for these tests. */
function stubCustomerUpsert() {
  (prisma.customer.upsert as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ where, create, update }: { where: { cedula: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const existing = prisma.__rows("customer").find((row) => row.cedula === where.cedula);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: `customer-${where.cedula}`, cedula: where.cedula, ...create };
      prisma.__seed("customer", row as never);
      return row;
    },
  );
}

/** getSlaDaysForRow() upserts a singleton SLAConfig row; give it a fixed default. */
function stubSlaConfigUpsert() {
  (prisma.sLAConfig.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "default", businessDays: 5 });
}

/**
 * The shared mock's `findFirst` only matches `where.id` (see mock-route.ts).
 * persistDebitConsolidadoImport looks up by { requestNumber, productType }, so
 * give `card.findFirst` real semantics for that shape here rather than
 * widening the shared mock for every other test file that uses it.
 */
function stubCardFindFirstByRequestNumber() {
  (prisma.card.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ where }: { where: { requestNumber?: string; productType?: string } }) =>
      prisma
        .__rows("card")
        .find((row) => row.requestNumber === where.requestNumber && row.productType === where.productType) ?? null,
  );
}

function baseConsolidadoRow(overrides: Partial<Parameters<typeof persistDebitConsolidadoImport>[0]["rows"][number]> = {}) {
  return {
    requestNumber: "REQ-1",
    tc: "REQ-1",
    cedula: "00100000900",
    nombre: "Cliente Uno",
    provincia: "Santo Domingo",
    zona: "Metro",
    direccionRaw: "Calle 1",
    telefonosRaw: "8091234567",
    status: CardStatus.TD_ENTREGADO,
    rawStatus: "Entregado",
    dispatchDate: new Date("2026-01-01T00:00:00Z"),
    deliveryDate: null,
    isRemote: false,
    productType: CardProductType.DEBITO,
    dispatchOrigin: DispatchOrigin.BPD_DEBITO,
    comment: "Charina Mendez",
    recipientName: null,
    thirdPartyInfo: null,
    bpdComment: null,
    callCenterStatus: null,
    callCenterContact: null,
    officeName: null,
    analyst: null,
    rawRecord: {},
    sourceRowNumber: 2,
    ...overrides,
  };
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
  stubCustomerUpsert();
  stubSlaConfigUpsert();
  stubCardFindFirstByRequestNumber();
});

describe("persistDebitConsolidadoImport: no-op status must not write a bitácora row", () => {
  it("re-importing the same file with an unchanged status logs nothing", async () => {
    prisma.__seed("card", {
      id: "card-1",
      tc: "REQ-1",
      requestNumber: "REQ-1",
      productType: "DEBITO",
      status: "TD_ENTREGADO",
      isRemote: false,
      returnReason: null,
      digitalDeliveryCycle: 0,
      dispatchDate: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      metadata: {},
    } as never);

    await persistDebitConsolidadoImport({
      batchId: "batch-1",
      rows: [baseConsolidadoRow({ status: CardStatus.TD_ENTREGADO })],
    });

    expect(prisma.__row("card", "card-1")?.status).toBe("TD_ENTREGADO");
    expect(prisma.__rows("cardStatusLog")).toHaveLength(0);
  });

  it("a genuine status change is still logged, with the comment attached", async () => {
    prisma.__seed("card", {
      id: "card-2",
      tc: "REQ-2",
      requestNumber: "REQ-2",
      productType: "DEBITO",
      status: "EN_RUTA",
      isRemote: false,
      returnReason: null,
      digitalDeliveryCycle: 0,
      dispatchDate: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      metadata: {},
    } as never);

    await persistDebitConsolidadoImport({
      batchId: "batch-2",
      rows: [baseConsolidadoRow({ requestNumber: "REQ-2", tc: "REQ-2", status: CardStatus.TD_ENTREGADO, comment: "Andy Lenny" })],
    });

    expect(prisma.__row("card", "card-2")?.status).toBe("TD_ENTREGADO");
    const logs = prisma.__rows("cardStatusLog");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ fromStatus: "EN_RUTA", toStatus: "TD_ENTREGADO", note: "Andy Lenny" });
  });
});

describe("updateCardsFromPinitExport: no-op status must not write a bitácora row", () => {
  it("re-downloading the same Pinit export with an unchanged status logs nothing", async () => {
    prisma.__seed("card", {
      id: "card-3",
      tc: "REQ-3",
      requestNumber: "REQ-3",
      productType: "DEBITO",
      status: "TD_ENTREGADO",
      isRemote: false,
      returnReason: null,
      digitalDeliveryCycle: 0,
      dispatchDate: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      metadata: {},
    } as never);

    await updateCardsFromPinitExport({
      rows: [
        {
          requestNumber: "REQ-3",
          trackingNumber: "TRK-1",
          customerName: "Cliente Tres",
          customerPhone: null,
          customerAddress: null,
          rawStatus: "360 - Entregado al cliente",
          mappedStatus: CardStatus.TD_ENTREGADO,
          deliveryDate: null,
          recipientName: null,
          messengerName: null,
          messengerEmail: null,
          attemptsCount: 1,
          lastAttemptNotes: null,
          sourceRowNumber: 2,
        },
      ],
    });

    expect(prisma.__row("card", "card-3")?.status).toBe("TD_ENTREGADO");
    expect(prisma.__rows("cardStatusLog")).toHaveLength(0);
  });

  it("a genuine status change from Pinit is still logged", async () => {
    prisma.__seed("card", {
      id: "card-4",
      tc: "REQ-4",
      requestNumber: "REQ-4",
      productType: "DEBITO",
      status: "EN_RUTA",
      isRemote: false,
      returnReason: null,
      digitalDeliveryCycle: 0,
      dispatchDate: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      metadata: {},
    } as never);

    await updateCardsFromPinitExport({
      rows: [
        {
          requestNumber: "REQ-4",
          trackingNumber: "TRK-2",
          customerName: "Cliente Cuatro",
          customerPhone: null,
          customerAddress: null,
          rawStatus: "360 - Entregado al cliente",
          mappedStatus: CardStatus.TD_ENTREGADO,
          deliveryDate: null,
          recipientName: null,
          messengerName: null,
          messengerEmail: null,
          attemptsCount: 1,
          lastAttemptNotes: null,
          sourceRowNumber: 2,
        },
      ],
    });

    const logs = prisma.__rows("cardStatusLog");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ fromStatus: "EN_RUTA", toStatus: "TD_ENTREGADO" });
  });
});
