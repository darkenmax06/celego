import { CardStatus, MessengerServiceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findPeriod, payrollDay } from "@/lib/payroll/period";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Statuses that pay the messenger: physical and digital deliveries. A digital
 * delivery pays like a normal one, and a card flagged as remote zone pays the
 * REMOTA rate either way.
 */
export const DELIVERED_STATUSES: readonly CardStatus[] = [
  CardStatus.ENTREGADA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.TD_ENTREGADO,
  CardStatus.ENTREGA_SIN_CONTRATO,
];

export function isPaidDeliveryStatus(status: CardStatus | string | null | undefined) {
  return DELIVERED_STATUSES.includes(status as CardStatus);
}

export function serviceTypeForCard(card: { isRemote: boolean }): MessengerServiceType {
  return card.isRemote ? MessengerServiceType.REMOTA : MessengerServiceType.NORMAL;
}

type Credit = { messengerId: string; day: Date; serviceType: MessengerServiceType };
type DayRef = { messengerId: string; day: Date };

/**
 * Who a delivered card is credited to and when, or null when it is not a paid
 * delivery (or nobody can be credited). The messenger is the one on the card's
 * latest route, falling back to its last assigned messenger. The day is the first
 * entry into the current run of delivered statuses, so moving ENTREGA_SIN_CONTRATO
 * to ENTREGADA later does not shift the card to another day.
 */
export async function desiredCredit(db: Db, cardId: string): Promise<Credit | null> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      status: true,
      isRemote: true,
      updatedAt: true,
      currentMessengerId: true,
      lastAssignedMessengerId: true,
      routeItems: {
        select: { route: { select: { messengerId: true, fecha: true, createdAt: true } } },
      },
      logs: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!card || !isPaidDeliveryStatus(card.status)) return null;

  const latestRoute = [...card.routeItems]
    .map((item) => item.route)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.createdAt.getTime() - a.createdAt.getTime())[0];
  const messengerId = latestRoute?.messengerId ?? card.lastAssignedMessengerId ?? card.currentMessengerId;
  if (!messengerId) return null;

  let runStart: Date | null = null;
  for (const log of card.logs) {
    if (isPaidDeliveryStatus(log.toStatus)) runStart = runStart ?? log.createdAt;
    else runStart = null;
  }
  return { messengerId, day: payrollDay(runStart ?? card.updatedAt), serviceType: serviceTypeForCard(card) };
}

const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * First day a delivery can count on. A delivery registered after the messenger's
 * period was locked does not reopen it: it counts from the day after that period
 * ends (and keeps moving forward while the following periods are locked too).
 */
export async function firstOpenDay(db: Db, messengerId: string, day: Date) {
  let candidate = day;
  for (let guard = 0; guard < 400; guard += 1) {
    const state = await lockStateFor(db, messengerId, candidate);
    if (!state.locked || !state.period) return candidate;
    candidate = new Date(state.period.toDate.getTime() + DAY_MS);
  }
  return candidate;
}

/**
 * Brings the credit ledger in line with the cards' current state and returns the
 * (messenger, day) pairs whose count may have changed.
 *
 * A new delivery (or one that changes messenger or delivery day) is credited on
 * its first open day, so a locked period is never altered by later deliveries.
 * Withdrawing or retyping a delivery already counted in a locked period is a change
 * to that period and is queued as pending by the daily refresh instead.
 */
export async function syncCardCredits(db: Db, cardIds: string[]): Promise<DayRef[]> {
  const affected = new Map<string, DayRef>();
  const touch = (messengerId: string, day: Date) => affected.set(`${messengerId}|${day.toISOString()}`, { messengerId, day });

  for (const cardId of new Set(cardIds)) {
    const [desired, existing] = await Promise.all([
      desiredCredit(db, cardId),
      db.messengerDeliveryCredit.findUnique({ where: { cardId } }),
    ]);
    if (!desired && !existing) continue;

    const samePlace = Boolean(desired && existing && existing.messengerId === desired.messengerId && sameDay(existing.naturalDay, desired.day));
    if (desired && existing && samePlace && existing.serviceType === desired.serviceType) continue;

    if (existing) touch(existing.messengerId, existing.naturalDay);
    if (!desired) {
      await db.messengerDeliveryCredit.delete({ where: { cardId } });
      continue;
    }
    const countDay = samePlace && existing ? existing.day : await firstOpenDay(db, desired.messengerId, desired.day);
    touch(desired.messengerId, desired.day);
    await db.messengerDeliveryCredit.upsert({
      where: { cardId },
      create: { cardId, messengerId: desired.messengerId, serviceType: desired.serviceType, naturalDay: desired.day, day: countDay },
      update: { messengerId: desired.messengerId, serviceType: desired.serviceType, naturalDay: desired.day, day: countDay },
    });
  }
  return [...affected.values()];
}

export function totalForCounts(
  counts: { normales: number; remotas: number; recogidas: number; mandados: number },
  rates: { serviceType: string; amountCents: number }[],
) {
  const rate = (type: string) => rates.find((item) => item.serviceType === type)?.amountCents ?? 0;
  return counts.normales * rate("NORMAL") + counts.remotas * rate("REMOTA") + counts.recogidas * rate("RECOGIDA") + counts.mandados * rate("MANDADO");
}

/** Lock state of a messenger on a day: the period that covers it and whether it is closed. */
export async function lockStateFor(db: Db, messengerId: string, day: Date) {
  const periods = await db.payrollPeriod.findMany({
    where: { fromDate: { lte: day }, toDate: { gte: day }, OR: [{ messengerId: null }, { messengerId }] },
  });
  const period = findPeriod(periods, messengerId, day);
  if (!period) return { period: null, locked: false };
  const lock = await db.payrollPeriodLock.findUnique({ where: { periodId_messengerId: { periodId: period.id, messengerId } } });
  return { period, locked: lock?.status === "BLOQUEADO" };
}

export type RefreshOutcome = "UPDATED" | "PENDING" | "UNCHANGED";

/** Records that count inside [from, to]: by the day they count for, which is `fecha` unless the delivery was carried to a later period. */
export function countedBetween(from: Date, to: Date): Prisma.MessengerDailyRecordWhereInput {
  const end = new Date(to.getTime() + DAY_MS);
  return {
    OR: [
      { countDay: { gte: from, lt: end } },
      { countDay: null, fecha: { gte: from, lt: end } },
    ],
  };
}

type Line = { siguienteCorte: boolean; countDay: Date | null; normales: number; remotas: number };

/** Writes one line of a day (the main one or the after-cut one) from its credit counts. */
async function refreshLine(db: Db, messengerId: string, day: Date, line: Line, rates: { serviceType: string; amountCents: number }[], options: { ignoreLock?: boolean }): Promise<RefreshOutcome> {
  const existing = await db.messengerDailyRecord.findFirst({
    where: {
      messengerId,
      fecha: { gte: day, lt: new Date(day.getTime() + DAY_MS) },
      siguienteCorte: line.siguienteCorte,
      ...(line.siguienteCorte ? { countDay: line.countDay } : {}),
    },
  });

  // A locked line is only a pending change when its numbers would really move.
  const expectedTotal = existing
    ? totalForCounts(
        {
          normales: Math.max(0, line.normales + (line.siguienteCorte ? 0 : existing.ajusteNormales)),
          remotas: Math.max(0, line.remotas + (line.siguienteCorte ? 0 : existing.ajusteRemotas)),
          recogidas: line.siguienteCorte ? 0 : existing.recogidasBanco,
          mandados: line.siguienteCorte ? 0 : existing.mandados,
        },
        rates,
      )
    : 0;
  const wouldChange = existing
    ? existing.autoNormales !== line.normales || existing.autoRemotas !== line.remotas || existing.totalCents !== expectedTotal
    : line.normales > 0 || line.remotas > 0;
  if (!wouldChange) return "UNCHANGED";

  const lockDay = line.countDay ?? day;
  if (!options.ignoreLock) {
    const state = await lockStateFor(db, messengerId, lockDay);
    if (state.locked) {
      await db.payrollPendingChange.upsert({
        where: { messengerId_day: { messengerId, day } },
        create: { messengerId, day },
        update: {},
      });
      return "PENDING";
    }
  }

  if (line.siguienteCorte) {
    // The after-cut line is purely automatic: it disappears when nothing is left on it.
    if (line.normales === 0 && line.remotas === 0) {
      if (!existing) return "UNCHANGED";
      await db.messengerDailyRecord.delete({ where: { id: existing.id } });
      return "UPDATED";
    }
    const totalCents = totalForCounts({ normales: line.normales, remotas: line.remotas, recogidas: 0, mandados: 0 }, rates);
    const data = { autoNormales: line.normales, autoRemotas: line.remotas, entregasNormales: line.normales, entregasRemotas: line.remotas, totalCents };
    if (!existing) {
      await db.messengerDailyRecord.create({ data: { messengerId, fecha: day, siguienteCorte: true, countDay: line.countDay, ...data } });
      return "UPDATED";
    }
    if (existing.autoNormales === line.normales && existing.autoRemotas === line.remotas && existing.totalCents === totalCents) return "UNCHANGED";
    await db.messengerDailyRecord.update({ where: { id: existing.id }, data });
    return "UPDATED";
  }

  if (!existing && line.normales === 0 && line.remotas === 0) return "UNCHANGED";
  const ajusteNormales = existing?.ajusteNormales ?? 0;
  const ajusteRemotas = existing?.ajusteRemotas ?? 0;
  const entregasNormales = Math.max(0, line.normales + ajusteNormales);
  const entregasRemotas = Math.max(0, line.remotas + ajusteRemotas);
  const totalCents = totalForCounts(
    { normales: entregasNormales, remotas: entregasRemotas, recogidas: existing?.recogidasBanco ?? 0, mandados: existing?.mandados ?? 0 },
    rates,
  );
  if (existing) {
    if (existing.autoNormales === line.normales && existing.autoRemotas === line.remotas && existing.totalCents === totalCents) return "UNCHANGED";
    await db.messengerDailyRecord.update({
      where: { id: existing.id },
      data: { autoNormales: line.normales, autoRemotas: line.remotas, entregasNormales, entregasRemotas, totalCents },
    });
  } else {
    await db.messengerDailyRecord.create({
      data: { messengerId, fecha: day, autoNormales: line.normales, autoRemotas: line.remotas, entregasNormales, entregasRemotas, totalCents },
    });
  }
  return "UPDATED";
}

/**
 * Rewrites the automatic part of one messenger's records for a delivery day.
 *
 * A day has one line, or two when its period was cut during the day: the line
 * inside the (locked) period and a second one, flagged `siguienteCorte`, with what
 * was delivered afterwards, which counts for the next period. A line whose period
 * is locked is left untouched and the day is queued as a pending change.
 */
export async function refreshDailyRecord(db: Db, messengerId: string, day: Date, options: { ignoreLock?: boolean } = {}): Promise<RefreshOutcome> {
  const [credits, rates, carriedRecords] = await Promise.all([
    db.messengerDeliveryCredit.findMany({ where: { messengerId, naturalDay: day }, select: { serviceType: true, day: true } }),
    db.messengerServiceRate.findMany({ where: { messengerId } }),
    db.messengerDailyRecord.findMany({
      where: { messengerId, siguienteCorte: true, fecha: { gte: day, lt: new Date(day.getTime() + DAY_MS) } },
      select: { countDay: true },
    }),
  ]);

  const tally = (rows: typeof credits) => ({
    normales: rows.filter((row) => row.serviceType === "NORMAL").length,
    remotas: rows.filter((row) => row.serviceType === "REMOTA").length,
  });
  const carried = credits.filter((row) => !sameDay(row.day, day));
  const countDays = new Map<number, Date>();
  for (const row of carried) countDays.set(row.day.getTime(), row.day);
  for (const record of carriedRecords) if (record.countDay) countDays.set(record.countDay.getTime(), record.countDay);

  const outcomes: RefreshOutcome[] = [
    await refreshLine(db, messengerId, day, { siguienteCorte: false, countDay: null, ...tally(credits.filter((row) => sameDay(row.day, day))) }, rates, options),
  ];
  for (const countDay of countDays.values()) {
    outcomes.push(
      await refreshLine(db, messengerId, day, { siguienteCorte: true, countDay, ...tally(carried.filter((row) => sameDay(row.day, countDay))) }, rates, options),
    );
  }
  if (outcomes.includes("PENDING")) return "PENDING";
  return outcomes.includes("UPDATED") ? "UPDATED" : "UNCHANGED";
}

export async function refreshDays(db: Db, days: DayRef[], options: { ignoreLock?: boolean } = {}) {
  const outcomes = { UPDATED: 0, PENDING: 0, UNCHANGED: 0 };
  for (const { messengerId, day } of days) outcomes[await refreshDailyRecord(db, messengerId, day, options)] += 1;
  return outcomes;
}

/** Entry point for card status changes: sync the ledger, then the affected days. */
export async function syncCardsAfterChange(db: Db, cardIds: string[]) {
  return refreshDays(db, await syncCardCredits(db, cardIds));
}

/**
 * Applies the changes queued while a period was locked. Called right after the
 * period is unlocked for that messenger, so the days are free to be rewritten.
 */
export async function applyPendingChanges(db: Db, messengerId: string, from: Date, to: Date) {
  const pending = await db.payrollPendingChange.findMany({ where: { messengerId, day: { gte: from, lte: to } } });
  const outcomes = await refreshDays(db, pending.map((item) => ({ messengerId, day: item.day })), { ignoreLock: true });
  await db.payrollPendingChange.deleteMany({ where: { messengerId, day: { gte: from, lte: to } } });
  return { applied: pending.length, ...outcomes };
}

export type RecountResult = {
  cardsChecked: number;
  daysTouched: number;
  updated: number;
  pendingLocked: number;
  unchanged: number;
};

/**
 * Settings action: rebuilds the credits for every delivery inside a range of payroll days
 * (cards imported or closed before the automatic count existed) and refreshes
 * the affected daily records. Locked periods are queued, never rewritten.
 */
export async function recountRange(input: { from: Date; to: Date; messengerId?: string }): Promise<RecountResult> {
  // `from` and `to` are payroll days (midnight UTC of the Dominican date), as the API passes them.
  const fromDay = input.from;
  const toDay = input.to;
  const start = new Date(fromDay.getTime() + 4 * 60 * 60 * 1000);
  const end = new Date(toDay.getTime() + 28 * 60 * 60 * 1000);

  const [fromLogs, staleCredits] = await Promise.all([
    prisma.cardStatusLog.findMany({
      where: { toStatus: { in: [...DELIVERED_STATUSES] }, createdAt: { gte: start, lt: end }, card: { status: { in: [...DELIVERED_STATUSES] } } },
      select: { cardId: true },
      distinct: ["cardId"],
    }),
    prisma.messengerDeliveryCredit.findMany({
      where: { naturalDay: { gte: fromDay, lte: toDay }, ...(input.messengerId ? { messengerId: input.messengerId } : {}) },
      select: { cardId: true },
    }),
  ]);
  const cardIds = [...new Set([...fromLogs.map((log) => log.cardId), ...staleCredits.map((credit) => credit.cardId)])];

  const touched = new Map<string, DayRef>();
  for (let index = 0; index < cardIds.length; index += 200) {
    const chunk = cardIds.slice(index, index + 200);
    const affected = await prisma.$transaction((tx) => syncCardCredits(tx, chunk));
    for (const ref of affected) touched.set(`${ref.messengerId}|${ref.day.toISOString()}`, ref);
  }
  // Days inside the range are always refreshed so a stale daily record converges even if no credit moved.
  const credits = await prisma.messengerDeliveryCredit.findMany({
    where: { naturalDay: { gte: fromDay, lte: toDay }, ...(input.messengerId ? { messengerId: input.messengerId } : {}) },
    select: { messengerId: true, naturalDay: true },
    distinct: ["messengerId", "naturalDay"],
  });
  for (const ref of credits) touched.set(`${ref.messengerId}|${ref.naturalDay.toISOString()}`, { messengerId: ref.messengerId, day: ref.naturalDay });

  const days = [...touched.values()].filter((ref) => (!input.messengerId || ref.messengerId === input.messengerId) && ref.day >= fromDay && ref.day <= toDay);
  const outcomes = await refreshDays(prisma, days);
  return { cardsChecked: cardIds.length, daysTouched: days.length, updated: outcomes.UPDATED, pendingLocked: outcomes.PENDING, unchanged: outcomes.UNCHANGED };
}
