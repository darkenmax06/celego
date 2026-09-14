import { CardStatus, Prisma, RouteStatus } from "@prisma/client";

export function buildRouteReassignmentNote(input: {
  previousRouteId: string;
  previousMessengerName: string;
  nextRouteId: string;
  nextMessengerName: string;
}) {
  return `Reasignada de ${input.previousMessengerName} (ruta ${input.previousRouteId}) a ${input.nextMessengerName} (ruta ${input.nextRouteId})`;
}

/** Audit note for a messenger change made outside route creation (bulk update). */
export function buildMessengerReassignmentNote(input: {
  previousMessengerName: string | null;
  previousRouteIds: string[];
  nextMessengerName: string | null;
}) {
  const from = input.previousMessengerName ?? "sin mensajero";
  const routes = input.previousRouteIds.length
    ? ` (retirada de ruta ${input.previousRouteIds.join(", ")})`
    : "";
  if (!input.nextMessengerName) return `Mensajero removido: ${from}${routes}`;
  return `Reasignada de ${from}${routes} a ${input.nextMessengerName}`;
}

export const ACTIVE_ROUTE_STATUSES = [RouteStatus.PENDIENTE, RouteStatus.EN_PROCESO];

export type DetachedRouteItem = {
  id: string;
  cardId: string;
  routeId: string;
  route: { messenger: { nombre: string } };
};

/**
 * Removes cards from every PENDIENTE / EN_PROCESO route and cancels the routes
 * left without items. `keepMessengerId` spares routes that already belong to
 * the target messenger, so a no-op reassignment never touches its route.
 * Must run inside the caller's transaction.
 */
export async function detachCardsFromActiveRoutes(
  tx: Prisma.TransactionClient,
  cardIds: string[],
  options: { keepMessengerId?: string | null } = {},
): Promise<DetachedRouteItem[]> {
  if (!cardIds.length) return [];
  const priorItems = await tx.routeItem.findMany({
    where: {
      cardId: { in: cardIds },
      route: {
        status: { in: ACTIVE_ROUTE_STATUSES },
        ...(options.keepMessengerId ? { messengerId: { not: options.keepMessengerId } } : {}),
      },
    },
    select: {
      id: true,
      cardId: true,
      routeId: true,
      route: { select: { messenger: { select: { nombre: true } } } },
    },
  });

  if (priorItems.length) {
    await tx.routeItem.deleteMany({ where: { id: { in: priorItems.map((item) => item.id) } } });
    await tx.route.updateMany({
      where: {
        id: { in: [...new Set(priorItems.map((item) => item.routeId))] },
        status: { in: ACTIVE_ROUTE_STATUSES },
        items: { none: {} },
      },
      data: { status: RouteStatus.CANCELADA },
    });
  }

  return priorItems;
}

export type MessengerReassignmentCard = {
  id: string;
  /** Status the card holds AFTER the surrounding update. */
  status: CardStatus;
  currentMessengerId: string | null;
};

export type MessengerReassignmentPlan = {
  /** Cards that moved away from a previous messenger or route. */
  reassignedCardIds: string[];
  logs: Array<{ cardId: string; fromStatus: CardStatus; toStatus: CardStatus; note: string }>;
};

/**
 * Pure planning step: decides which cards actually changed messenger and the
 * status-log note each one gets. A card already held by the target messenger
 * and not sitting on another messenger's active route is left untouched.
 */
export function planMessengerReassignment(input: {
  cards: MessengerReassignmentCard[];
  detachedItems: DetachedRouteItem[];
  nextMessengerId: string | null;
  messengerNames: Record<string, string>;
}): MessengerReassignmentPlan {
  const reassignedCardIds: string[] = [];
  const logs: MessengerReassignmentPlan["logs"] = [];

  for (const card of input.cards) {
    const items = input.detachedItems.filter((item) => item.cardId === card.id);
    const messengerChanged = card.currentMessengerId !== input.nextMessengerId;
    if (!messengerChanged && !items.length) continue;

    const previousMessengerName =
      (card.currentMessengerId ? input.messengerNames[card.currentMessengerId] : undefined) ??
      items[0]?.route.messenger.nombre ??
      null;
    const nextMessengerName = input.nextMessengerId
      ? input.messengerNames[input.nextMessengerId] ?? input.nextMessengerId
      : null;

    if (input.nextMessengerId && (card.currentMessengerId || items.length)) {
      reassignedCardIds.push(card.id);
    }
    logs.push({
      cardId: card.id,
      fromStatus: card.status,
      toStatus: card.status,
      note: buildMessengerReassignmentNote({
        previousMessengerName,
        previousRouteIds: [...new Set(items.map((item) => item.routeId))],
        nextMessengerName,
      }),
    });
  }

  return { reassignedCardIds, logs };
}

/**
 * Applies route-reassignment semantics to a messenger change: detaches the
 * cards from other messengers' active routes (cancelling emptied routes),
 * stamps `reassignedMessengerId` / `reassignedAt` and writes one audit log per
 * affected card. The card's `currentMessengerId` itself is written by the
 * caller. Must run inside the caller's transaction.
 */
export async function applyMessengerReassignment(
  tx: Prisma.TransactionClient,
  input: {
    cards: MessengerReassignmentCard[];
    nextMessengerId: string | null;
    byUserId?: string;
  },
): Promise<MessengerReassignmentPlan> {
  const detachedItems = await detachCardsFromActiveRoutes(
    tx,
    input.cards.map((card) => card.id),
    { keepMessengerId: input.nextMessengerId },
  );

  const messengerIds = [
    ...new Set(
      [input.nextMessengerId, ...input.cards.map((card) => card.currentMessengerId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const messengers = messengerIds.length
    ? await tx.messenger.findMany({ where: { id: { in: messengerIds } }, select: { id: true, nombre: true } })
    : [];
  const messengerNames = Object.fromEntries(messengers.map((item) => [item.id, item.nombre]));

  const plan = planMessengerReassignment({
    cards: input.cards,
    detachedItems,
    nextMessengerId: input.nextMessengerId,
    messengerNames,
  });

  if (plan.reassignedCardIds.length && input.nextMessengerId) {
    await tx.card.updateMany({
      where: { id: { in: plan.reassignedCardIds } },
      data: { reassignedMessengerId: input.nextMessengerId, reassignedAt: new Date() },
    });
  }
  if (plan.logs.length) {
    await tx.cardStatusLog.createMany({
      data: plan.logs.map((log) => ({ ...log, byUserId: input.byUserId })),
    });
  }

  return plan;
}
