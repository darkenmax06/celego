import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardStatus } from "@prisma/client";
import { digitalCycleUpdate, initialDigitalCycle } from "@/lib/card-transition";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 1, task 1.3/6.2.
 *
 * Approval tests: the first two cases in each describe block pin CURRENT
 * `digitalCycleUpdate`/`initialDigitalCycle` behavior for ENTREGA_DIGITAL
 * before the membership-set widening lands, so a regression shows as a
 * diff. The remaining cases assert the NEW `ENTREGA_DIGITAL_SIN_CONTRATO`
 * membership behavior from design D-decision #2 (session #602/#603).
 */
describe("digitalCycleUpdate — approval (existing ENTREGA_DIGITAL behavior, unchanged)", () => {
  it("increments the cycle and resets bizcochito when entering ENTREGA_DIGITAL from a non-digital status", () => {
    expect(
      digitalCycleUpdate({ status: CardStatus.EN_RUTA, digitalDeliveryCycle: 2 }, CardStatus.ENTREGA_DIGITAL),
    ).toEqual({ digitalDeliveryCycle: 3, bizcochito: false, bizcochitoAt: null });
  });

  it("returns an empty patch when already ENTREGA_DIGITAL and staying ENTREGA_DIGITAL", () => {
    expect(
      digitalCycleUpdate(
        { status: CardStatus.ENTREGA_DIGITAL, digitalDeliveryCycle: 1 },
        CardStatus.ENTREGA_DIGITAL,
      ),
    ).toEqual({});
  });

  it("returns an empty patch for a transition that never touches ENTREGA_DIGITAL", () => {
    expect(
      digitalCycleUpdate({ status: CardStatus.EN_RUTA, digitalDeliveryCycle: 0 }, CardStatus.ACUSE_RECIBIDO),
    ).toEqual({});
  });
});

describe("digitalCycleUpdate — membership-set widening (ENTREGA_DIGITAL_SIN_CONTRATO)", () => {
  it("increments the cycle when entering ENTREGA_DIGITAL_SIN_CONTRATO from a non-digital status", () => {
    expect(
      digitalCycleUpdate(
        { status: CardStatus.EN_RUTA, digitalDeliveryCycle: 0 },
        CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO,
      ),
    ).toEqual({ digitalDeliveryCycle: 1, bizcochito: false, bizcochitoAt: null });
  });

  it("does NOT double-increment when resolving ENTREGA_DIGITAL_SIN_CONTRATO -> ENTREGA_DIGITAL (both sides already in the digital-delivery set)", () => {
    expect(
      digitalCycleUpdate(
        { status: CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO, digitalDeliveryCycle: 1 },
        CardStatus.ENTREGA_DIGITAL,
      ),
    ).toEqual({});
  });
});

describe("initialDigitalCycle — membership-set widening", () => {
  it("still initializes cycle=1 for ENTREGA_DIGITAL (approval)", () => {
    expect(initialDigitalCycle(CardStatus.ENTREGA_DIGITAL)).toEqual({
      digitalDeliveryCycle: 1,
      bizcochito: false,
      bizcochitoAt: null,
    });
  });

  it("also initializes cycle=1 for ENTREGA_DIGITAL_SIN_CONTRATO", () => {
    expect(initialDigitalCycle(CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO)).toEqual({
      digitalDeliveryCycle: 1,
      bizcochito: false,
      bizcochitoAt: null,
    });
  });

  it("returns an empty patch for a non-digital status (approval)", () => {
    expect(initialDigitalCycle(CardStatus.EN_RUTA)).toEqual({});
  });
});

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 1, task 1.6/1.8.
 *
 * `applyCardTransition` must branch on `classifyCardLifecycle` (design D4):
 * CLOSED calls `clearUrgencyOnCardClosure` (unchanged), PENDING_RECEPTION
 * calls the NEW `parkUrgencyOnPendingReception`, ACTIVE calls neither.
 */
vi.mock("@/lib/dispatch-origin", () => ({
  isTerminalCardStatus: () => false,
  nextTcGuardState: () => ({}),
}));

const clearUrgencyOnCardClosure = vi.fn(async () => false);
const parkUrgencyOnPendingReception = vi.fn(async () => false);

vi.mock("@/lib/urgent-alerts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/urgent-alerts")>("@/lib/urgent-alerts");
  return {
    ...actual,
    clearUrgencyOnCardClosure: (...args: unknown[]) => clearUrgencyOnCardClosure(...args),
    parkUrgencyOnPendingReception: (...args: unknown[]) => parkUrgencyOnPendingReception(...args),
  };
});

describe("applyCardTransition — lifecycle branching (design D4)", () => {
  beforeEach(() => {
    clearUrgencyOnCardClosure.mockClear();
    parkUrgencyOnPendingReception.mockClear();
  });

  function buildTx() {
    return {
      card: { update: vi.fn(async ({ data }: { data: unknown }) => ({ id: "card-1", ...(data as object) })) },
      cardStatusLog: { create: vi.fn(async () => undefined) },
      cardTcGuard: { upsert: vi.fn(async () => undefined) },
    };
  }

  const baseCard = {
    id: "card-1",
    tc: "4000000000000000",
    status: CardStatus.EN_RUTA,
    returnReason: null,
    digitalDeliveryCycle: 0,
  };

  it("CLOSED transition (ENTREGADA) calls clearUrgencyOnCardClosure and NOT parkUrgencyOnPendingReception", async () => {
    const { applyCardTransition } = await import("@/lib/card-transition");
    const tx = buildTx();

    await applyCardTransition({
      tx: tx as never,
      card: baseCard,
      nextStatus: CardStatus.ENTREGADA,
    });

    expect(clearUrgencyOnCardClosure).toHaveBeenCalledTimes(1);
    expect(parkUrgencyOnPendingReception).not.toHaveBeenCalled();
  });

  it("PENDING_RECEPTION transition (EN_PROCESO_DE_RETORNO) calls parkUrgencyOnPendingReception and NOT clearUrgencyOnCardClosure", async () => {
    const { applyCardTransition } = await import("@/lib/card-transition");
    const tx = buildTx();

    await applyCardTransition({
      tx: tx as never,
      card: baseCard,
      nextStatus: CardStatus.EN_PROCESO_DE_RETORNO,
    });

    expect(parkUrgencyOnPendingReception).toHaveBeenCalledTimes(1);
    expect(clearUrgencyOnCardClosure).not.toHaveBeenCalled();
  });

  it("ACTIVE transition (ACUSE_RECIBIDO from EN_RUTA is CLOSED though — use a genuinely ACTIVE target: EN_RUTA -> EN_RUTA) calls neither", async () => {
    const { applyCardTransition } = await import("@/lib/card-transition");
    const tx = buildTx();

    await applyCardTransition({
      tx: tx as never,
      card: baseCard,
      nextStatus: CardStatus.EN_RUTA,
    });

    expect(clearUrgencyOnCardClosure).not.toHaveBeenCalled();
    expect(parkUrgencyOnPendingReception).not.toHaveBeenCalled();
  });
});
