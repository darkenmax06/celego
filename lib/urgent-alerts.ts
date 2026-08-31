import { CardStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const URGENCY_CONFIG: Record<number, { label: string; intervalMinutes: number }> = {
  1: { label: "Nivel 1 (Leve)", intervalMinutes: 270 },
  2: { label: "Nivel 2 (Moderada)", intervalMinutes: 210 },
  3: { label: "Nivel 3 (Alta)", intervalMinutes: 150 },
  4: { label: "Nivel 4 (Muy urgente)", intervalMinutes: 90 },
  5: { label: "Nivel 5 (Extremadamente urgente)", intervalMinutes: 30 },
};

type TxClient = Prisma.TransactionClient | typeof prisma;

type DueAlertResult = {
  urgentCaseId: string;
  cardId: string;
  tc: string;
  cliente: string;
  cedula: string;
  provincia: string;
  level: number;
  label: string;
  intervalMinutes: number;
  nextNotificationAt: string;
};

function addMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60_000);
}

export function clampUrgencyLevel(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 1;
  const parsed = Math.trunc(Number(value));
  return Math.max(1, Math.min(5, parsed));
}

export function urgencyIntervalMinutes(level: number) {
  const safeLevel = clampUrgencyLevel(level);
  return URGENCY_CONFIG[safeLevel].intervalMinutes;
}

export function urgencyLevelLabel(level: number) {
  const safeLevel = clampUrgencyLevel(level);
  return URGENCY_CONFIG[safeLevel].label;
}

export function nextUrgentNotificationAt(level: number, from = new Date()) {
  return addMinutes(from, urgencyIntervalMinutes(level));
}

export async function getActiveUrgentCase(cardId: string, tx: TxClient = prisma) {
  return tx.urgentCase.findFirst({
    where: { cardId, resolvedAt: null },
    orderBy: [{ level: "desc" }, { importedAt: "desc" }],
  });
}

export async function emitDueUrgentNotifications(args?: {
  byUserId?: string | null;
  limit?: number;
}) {
  const now = new Date();
  const limit = Math.max(1, Math.min(100, args?.limit ?? 40));
  const dueCases = await prisma.urgentCase.findMany({
    where: {
      resolvedAt: null,
      cardId: { not: null },
      nextNotificationAt: { lte: now },
    },
    include: {
      card: {
        select: {
          id: true,
          tc: true,
          status: true,
          urgent: true,
          provincia: true,
          customer: {
            select: {
              nombre: true,
              cedula: true,
            },
          },
        },
      },
    },
    orderBy: [{ level: "desc" }, { nextNotificationAt: "asc" }],
    take: limit,
  });

  if (!dueCases.length) {
    return [] as DueAlertResult[];
  }

  const result: DueAlertResult[] = [];
  await prisma.$transaction(async (tx) => {
    for (const item of dueCases) {
      const linkedCard = item.card;
      if (!linkedCard?.id || !linkedCard.urgent) {
        await tx.urgentCase.update({
          where: { id: item.id },
          data: {
            resolvedAt: now,
            resolvedById: args?.byUserId ?? undefined,
            status: "RESUELTO_AUTO",
            nextNotificationAt: null,
          },
        });
        continue;
      }

      const level = clampUrgencyLevel(item.level);
      const interval = urgencyIntervalMinutes(level);
      const nextAt = nextUrgentNotificationAt(level, now);
      const label = urgencyLevelLabel(level);

      await tx.urgentCase.update({
        where: { id: item.id },
        data: {
          lastNotifiedAt: now,
          nextNotificationAt: nextAt,
        },
      });

      await tx.cardStatusLog.create({
        data: {
          cardId: linkedCard.id,
          fromStatus: linkedCard.status,
          toStatus: linkedCard.status,
          note: `Recordatorio urgencia ${label}. Proxima notificacion en ${interval} minutos.`,
          byUserId: args?.byUserId ?? undefined,
        },
      });

      result.push({
        urgentCaseId: item.id,
        cardId: linkedCard.id,
        tc: linkedCard.tc,
        cliente: linkedCard.customer.nombre,
        cedula: linkedCard.customer.cedula,
        provincia: linkedCard.provincia,
        level,
        label,
        intervalMinutes: interval,
        nextNotificationAt: nextAt.toISOString(),
      });
    }
  });

  return result;
}

export function urgentStatusLabel(level: number) {
  const safeLevel = clampUrgencyLevel(level);
  return `URGENTE_NIVEL_${safeLevel}`;
}

/**
 * SDD solicitudes-reclamaciones-urgentes (design D4): tri-state lifecycle
 * classification. `CLOSED` is the exact pre-existing `isClosedCardStatus`
 * set. `PENDING_RECEPTION` covers statuses parked awaiting physical return
 * receipt — the card leaves Tarjetas Urgentes but its `UrgentCase` history
 * stays open. Everything else is `ACTIVE`.
 */
export type CardLifecyclePhase = "CLOSED" | "PENDING_RECEPTION" | "ACTIVE";

const CLOSED_STATUSES = new Set<CardStatus>([
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
]);

const PENDING_RECEPTION_STATUSES = new Set<CardStatus>([
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.EN_PROCESO_DE_RETORNO,
]);

export function classifyCardLifecycle(status: CardStatus): CardLifecyclePhase {
  if (CLOSED_STATUSES.has(status)) return "CLOSED";
  if (PENDING_RECEPTION_STATUSES.has(status)) return "PENDING_RECEPTION";
  return "ACTIVE";
}

export function isClosedCardStatus(status: CardStatus) {
  return classifyCardLifecycle(status) === "CLOSED";
}

/**
 * SDD solicitudes-reclamaciones-urgentes (design D4): called from
 * `applyCardTransition` for `PENDING_RECEPTION` transitions. Sets
 * `Card.urgent = false` (removes the card from Tarjetas Urgentes) and stops
 * reminder spam (`nextNotificationAt = null` on the open case), but does
 * NOT resolve the `UrgentCase` — Pendiente de Recepcion is derived from
 * `Card.status` + open-case existence, so the case must stay open.
 */
export async function parkUrgencyOnPendingReception(args: {
  cardId: string;
  nextStatus: CardStatus;
  byUserId?: string | null;
  tx?: TxClient;
}) {
  const client = args.tx ?? prisma;

  const [clearedUrgentFlag, pausedNotifications] = await Promise.all([
    client.card.updateMany({
      where: { id: args.cardId, urgent: true },
      data: { urgent: false },
    }),
    client.urgentCase.updateMany({
      where: { cardId: args.cardId, resolvedAt: null },
      data: { nextNotificationAt: null },
    }),
  ]);

  return clearedUrgentFlag.count > 0 || pausedNotifications.count > 0;
}

export async function clearUrgencyOnCardClosure(args: {
  cardId: string;
  nextStatus: CardStatus;
  byUserId?: string | null;
  tx?: TxClient;
}) {
  if (!isClosedCardStatus(args.nextStatus)) {
    return false;
  }

  const now = new Date();
  const client = args.tx ?? prisma;

  const [resolvedCases, clearedUrgentFlag] = await Promise.all([
    client.urgentCase.updateMany({
      where: {
        cardId: args.cardId,
        resolvedAt: null,
      },
      data: {
        resolvedAt: now,
        resolvedById: args.byUserId ?? null,
        status: "RESUELTO_AUTO_CIERRE",
        nextNotificationAt: null,
      },
    }),
    client.card.updateMany({
      where: {
        id: args.cardId,
        urgent: true,
      },
      data: {
        urgent: false,
      },
    }),
  ]);

  return resolvedCases.count > 0 || clearedUrgentFlag.count > 0;
}
