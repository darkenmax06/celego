import { CardStatus, RouteStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  applyMessengerReassignment,
  buildMessengerReassignmentNote,
  buildRouteReassignmentNote,
  detachCardsFromActiveRoutes,
  planMessengerReassignment,
  type DetachedRouteItem,
} from "@/lib/route-reassignment";

describe("buildRouteReassignmentNote", () => {
  it("records the prior and new route and messenger in a reassignment audit note", () => {
    expect(
      buildRouteReassignmentNote({
        previousRouteId: "route-old",
        previousMessengerName: "Ana",
        nextRouteId: "route-new",
        nextMessengerName: "Luis",
      }),
    ).toBe("Reasignada de Ana (ruta route-old) a Luis (ruta route-new)");
  });
});

describe("buildMessengerReassignmentNote", () => {
  it("names the previous messenger, the route the card left and the new messenger", () => {
    expect(
      buildMessengerReassignmentNote({
        previousMessengerName: "Ana",
        previousRouteIds: ["route-old"],
        nextMessengerName: "Luis",
      }),
    ).toBe("Reasignada de Ana (retirada de ruta route-old) a Luis");
  });

  it("describes an unassignment", () => {
    expect(
      buildMessengerReassignmentNote({ previousMessengerName: "Ana", previousRouteIds: [], nextMessengerName: null }),
    ).toBe("Mensajero removido: Ana");
  });
});

const item = (cardId: string, routeId: string, nombre: string): DetachedRouteItem => ({
  id: `item-${cardId}-${routeId}`,
  cardId,
  routeId,
  route: { messenger: { nombre } },
});

describe("planMessengerReassignment", () => {
  const names = { "m-ana": "Ana", "m-luis": "Luis" };

  it("skips a card that already belongs to the target messenger and sits on no other route", () => {
    const plan = planMessengerReassignment({
      cards: [{ id: "c1", status: CardStatus.EN_RUTA, currentMessengerId: "m-luis" }],
      detachedItems: [],
      nextMessengerId: "m-luis",
      messengerNames: names,
    });
    expect(plan).toEqual({ reassignedCardIds: [], logs: [] });
  });

  it("marks cards moved from another messenger or route as reassigned and logs each move", () => {
    const plan = planMessengerReassignment({
      cards: [
        { id: "c1", status: CardStatus.EN_RUTA, currentMessengerId: "m-ana" },
        { id: "c2", status: CardStatus.DESPACHADA, currentMessengerId: null },
      ],
      detachedItems: [item("c1", "r1", "Ana")],
      nextMessengerId: "m-luis",
      messengerNames: names,
    });
    expect(plan.reassignedCardIds).toEqual(["c1"]);
    expect(plan.logs).toEqual([
      {
        cardId: "c1",
        fromStatus: CardStatus.EN_RUTA,
        toStatus: CardStatus.EN_RUTA,
        note: "Reasignada de Ana (retirada de ruta r1) a Luis",
      },
      {
        cardId: "c2",
        fromStatus: CardStatus.DESPACHADA,
        toStatus: CardStatus.DESPACHADA,
        note: "Reasignada de sin mensajero a Luis",
      },
    ]);
  });
});

function createTx(priorItems: DetachedRouteItem[]) {
  return {
    routeItem: {
      findMany: vi.fn(async () => priorItems),
      deleteMany: vi.fn(async () => ({ count: priorItems.length })),
    },
    route: { updateMany: vi.fn(async () => ({ count: 1 })) },
    messenger: {
      findMany: vi.fn(async () => [
        { id: "m-ana", nombre: "Ana" },
        { id: "m-luis", nombre: "Luis" },
      ]),
    },
    card: { updateMany: vi.fn(async () => ({ count: 1 })) },
    cardStatusLog: { createMany: vi.fn(async () => ({ count: 1 })) },
  };
}

type Tx = Parameters<typeof detachCardsFromActiveRoutes>[0];

describe("detachCardsFromActiveRoutes", () => {
  it("removes the items from active routes and cancels routes left empty", async () => {
    const tx = createTx([item("c1", "r1", "Ana")]);
    await detachCardsFromActiveRoutes(tx as unknown as Tx, ["c1"], { keepMessengerId: "m-luis" });

    expect(tx.routeItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cardId: { in: ["c1"] },
          route: {
            status: { in: [RouteStatus.PENDIENTE, RouteStatus.EN_PROCESO] },
            messengerId: { not: "m-luis" },
          },
        },
      }),
    );
    expect(tx.routeItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["item-c1-r1"] } } });
    expect(tx.route.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["r1"] },
        status: { in: [RouteStatus.PENDIENTE, RouteStatus.EN_PROCESO] },
        items: { none: {} },
      },
      data: { status: RouteStatus.CANCELADA },
    });
  });

  it("touches nothing when no card is on an active route", async () => {
    const tx = createTx([]);
    await detachCardsFromActiveRoutes(tx as unknown as Tx, ["c1"]);
    expect(tx.routeItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.route.updateMany).not.toHaveBeenCalled();
  });
});

describe("applyMessengerReassignment", () => {
  it("stamps reassignment fields and writes the audit logs inside the transaction", async () => {
    const tx = createTx([item("c1", "r1", "Ana")]);
    const plan = await applyMessengerReassignment(tx as unknown as Tx, {
      cards: [{ id: "c1", status: CardStatus.EN_RUTA, currentMessengerId: "m-ana" }],
      nextMessengerId: "m-luis",
      byUserId: "u1",
    });

    expect(plan.reassignedCardIds).toEqual(["c1"]);
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1"] } },
      data: { reassignedMessengerId: "m-luis", reassignedAt: expect.any(Date) },
    });
    expect(tx.cardStatusLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          cardId: "c1",
          byUserId: "u1",
          note: "Reasignada de Ana (retirada de ruta r1) a Luis",
        }),
      ],
    });
  });

  it("does not stamp reassignment fields when the messenger is removed", async () => {
    const tx = createTx([item("c1", "r1", "Ana")]);
    await applyMessengerReassignment(tx as unknown as Tx, {
      cards: [{ id: "c1", status: CardStatus.DESPACHADA, currentMessengerId: "m-ana" }],
      nextMessengerId: null,
    });
    expect(tx.card.updateMany).not.toHaveBeenCalled();
    expect(tx.cardStatusLog.createMany).toHaveBeenCalledTimes(1);
  });
});
