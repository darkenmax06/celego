import { describe, expect, it } from "vitest";
import { CardStatus } from "@prisma/client";
import { classifyCardLifecycle, isClosedCardStatus, parkUrgencyOnPendingReception } from "@/lib/urgent-alerts";
import { createTransactionalPrismaMock } from "../golden/helpers/mock-route";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 1, task 1.5/1.8.
 *
 * Tri-state lifecycle classifier (design D4). `isClosedCardStatus` is kept
 * as a thin `classifyCardLifecycle(s) === "CLOSED"` wrapper — these tests
 * pin BOTH functions so a regression in one shows up immediately.
 */
describe("classifyCardLifecycle", () => {
  it("classifies every existing CLOSED status as CLOSED (approval of current isClosedCardStatus set)", () => {
    const closedStatuses: CardStatus[] = [
      CardStatus.ENTREGADA,
      CardStatus.RETORNADA,
      CardStatus.ACUSE_RECIBIDO,
      CardStatus.DEVUELTA_TIENDA,
      CardStatus.TD_ENTREGADO,
      CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
      CardStatus.TD_NO_LE_INTERESA,
      CardStatus.TD_RETIRADA_EN_OFICINA,
      CardStatus.TD_SOLICITADA_POR_ERROR,
      CardStatus.TD_ZONA_FUERA_COBERTURA,
    ];

    for (const status of closedStatuses) {
      expect(classifyCardLifecycle(status)).toBe("CLOSED");
    }
  });

  it("classifies ENTREGA_DIGITAL and EN_PROCESO_DE_RETORNO as PENDING_RECEPTION", () => {
    expect(classifyCardLifecycle(CardStatus.ENTREGA_DIGITAL)).toBe("PENDING_RECEPTION");
    expect(classifyCardLifecycle(CardStatus.EN_PROCESO_DE_RETORNO)).toBe("PENDING_RECEPTION");
  });

  it("classifies an in-flight status (EN_RUTA) as ACTIVE", () => {
    expect(classifyCardLifecycle(CardStatus.EN_RUTA)).toBe("ACTIVE");
  });

  it("classifies DESPACHADA and ENVIADA_INTERIOR as ACTIVE (not yet dispatched to a route)", () => {
    expect(classifyCardLifecycle(CardStatus.DESPACHADA)).toBe("ACTIVE");
    expect(classifyCardLifecycle(CardStatus.ENVIADA_INTERIOR)).toBe("ACTIVE");
  });
});

describe("isClosedCardStatus — thin wrapper over classifyCardLifecycle", () => {
  it("returns true only for CLOSED-classified statuses", () => {
    expect(isClosedCardStatus(CardStatus.ENTREGADA)).toBe(true);
    expect(isClosedCardStatus(CardStatus.RETORNADA)).toBe(true);
  });

  it("returns false for PENDING_RECEPTION statuses (ENTREGA_DIGITAL, EN_PROCESO_DE_RETORNO)", () => {
    expect(isClosedCardStatus(CardStatus.ENTREGA_DIGITAL)).toBe(false);
    expect(isClosedCardStatus(CardStatus.EN_PROCESO_DE_RETORNO)).toBe(false);
  });

  it("returns false for an ACTIVE status (EN_RUTA)", () => {
    expect(isClosedCardStatus(CardStatus.EN_RUTA)).toBe(false);
  });
});

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 1, task 1.5/1.8.
 *
 * `parkUrgencyOnPendingReception` sets `Card.urgent=false` and stops
 * reminder spam (`nextNotificationAt=null`), but must NOT resolve the open
 * `UrgentCase` — it stays open so Pendiente de Recepcion can derive its
 * list purely from `Card.status` + open-case existence (design D4).
 */
describe("parkUrgencyOnPendingReception", () => {
  it("clears Card.urgent and nulls nextNotificationAt, but leaves the open UrgentCase unresolved", async () => {
    const tx = createTransactionalPrismaMock();
    tx.__seed("card", { id: "card-1", urgent: true } as never);
    tx.__seed("urgentCase", {
      id: "case-1",
      cardId: "card-1",
      resolvedAt: null,
      nextNotificationAt: new Date("2026-08-30T10:00:00.000Z"),
      status: "PENDIENTE",
    } as never);

    const result = await parkUrgencyOnPendingReception({
      tx: tx as never,
      cardId: "card-1",
      nextStatus: CardStatus.EN_PROCESO_DE_RETORNO,
      byUserId: "user-1",
    });

    expect(result).toBe(true);
    expect(tx.__row("card", "card-1")).toMatchObject({ urgent: false });
    expect(tx.__row("urgentCase", "case-1")).toMatchObject({
      resolvedAt: null,
      status: "PENDIENTE",
      nextNotificationAt: null,
    });
  });

  it("returns false and changes nothing when the card has no open urgent case / urgent flag", async () => {
    const tx = createTransactionalPrismaMock();
    tx.__seed("card", { id: "card-2", urgent: false } as never);

    const result = await parkUrgencyOnPendingReception({
      tx: tx as never,
      cardId: "card-2",
      nextStatus: CardStatus.ENTREGA_DIGITAL,
    });

    expect(result).toBe(false);
    expect(tx.__row("card", "card-2")).toMatchObject({ urgent: false });
  });
});
