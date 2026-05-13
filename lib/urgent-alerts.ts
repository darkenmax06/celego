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

export function isClosedCardStatus(status: CardStatus) {
  return (
    status === CardStatus.ENTREGADA ||
    status === CardStatus.RETORNADA ||
    status === CardStatus.ACUSE_RECIBIDO ||
    status === CardStatus.DEVUELTA_TIENDA
  );
}
