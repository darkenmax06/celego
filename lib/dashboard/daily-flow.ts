import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DELIVERED_STATUSES, RETURNED_STATUSES } from "@/lib/dashboard/status-segments";

export type DailyFlowPoint = {
  date: string;
  despachadas: number;
  contactadas: number;
  entregadas: number;
  retornadas: number;
};

export type DailyFlowRow = { date: string; series: Exclude<keyof DailyFlowPoint, "date">; count: number };

/** Longest series the dashboard draws; longer ranges keep their most recent days. */
export const DAILY_FLOW_MAX_DAYS = 370;

const DAY_MS = 86_400_000;
const TIME_ZONE = "America/Santo_Domingo";

function keyToUtc(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcToKey(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

/** First day the series covers once the range is capped to DAILY_FLOW_MAX_DAYS. */
export function cappedFromKey(fromKey: string, toKey: string) {
  const earliest = keyToUtc(toKey) - (DAILY_FLOW_MAX_DAYS - 1) * DAY_MS;
  return utcToKey(Math.max(keyToUtc(fromKey), earliest));
}

/** One point per day from fromKey to toKey (inclusive), zero-filled and merged with the counted rows. */
export function fillDailyFlow(fromKey: string, toKey: string, rows: DailyFlowRow[]): DailyFlowPoint[] {
  const start = keyToUtc(cappedFromKey(fromKey, toKey));
  const end = keyToUtc(toKey);
  const points = new Map<string, DailyFlowPoint>();
  for (let day = start; day <= end; day += DAY_MS) {
    const date = utcToKey(day);
    points.set(date, { date, despachadas: 0, contactadas: 0, entregadas: 0, retornadas: 0 });
  }
  for (const row of rows) {
    const point = points.get(row.date);
    if (point) point[row.series] += row.count;
  }
  return [...points.values()];
}

/**
 * Daily dispatched, contacted, delivered and returned cards. Dispatches count by
 * dispatch date; the rest count distinct cards by the local day the contact or
 * status change happened. Timestamps are stored as UTC without a zone.
 */
export async function loadDailyFlow(range: { fromKey: string; toKey: string }) {
  const fromKey = cappedFromKey(range.fromKey, range.toKey);
  // Loose UTC bounds keep the indexes usable; the local-day filter below is the exact one.
  const start = new Date(keyToUtc(fromKey) - DAY_MS);
  const end = new Date(keyToUtc(range.toKey) + 2 * DAY_MS);
  const localDay = (column: Prisma.Sql) => Prisma.sql`(${column} AT TIME ZONE 'UTC' AT TIME ZONE ${TIME_ZONE})::date`;
  const inLocalRange = (column: Prisma.Sql) =>
    Prisma.sql`${localDay(column)} BETWEEN ${fromKey}::date AND ${range.toKey}::date`;

  const rows = await prisma.$queryRaw<Array<{ date: Date | string; series: DailyFlowRow["series"]; count: bigint | number }>>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`c."dispatchDate"`)} AS date, 'despachadas' AS series, COUNT(*) AS count
      FROM "Card" c
     WHERE c."dispatchDate" BETWEEN ${start} AND ${end}
       AND ${inLocalRange(Prisma.sql`c."dispatchDate"`)}
     GROUP BY 1
    UNION ALL
    SELECT ${localDay(Prisma.sql`l."createdAt"`)}, 'contactadas', COUNT(DISTINCT l."cardId")
      FROM "ContactLog" l
     WHERE l.contactado = true
       AND l."createdAt" BETWEEN ${start} AND ${end}
       AND ${inLocalRange(Prisma.sql`l."createdAt"`)}
     GROUP BY 1
    UNION ALL
    SELECT ${localDay(Prisma.sql`s."createdAt"`)}, 'entregadas', COUNT(DISTINCT s."cardId")
      FROM "CardStatusLog" s
     WHERE s."toStatus"::text IN (${Prisma.join([...DELIVERED_STATUSES])})
       AND s."createdAt" BETWEEN ${start} AND ${end}
       AND ${inLocalRange(Prisma.sql`s."createdAt"`)}
     GROUP BY 1
    UNION ALL
    SELECT ${localDay(Prisma.sql`s."createdAt"`)}, 'retornadas', COUNT(DISTINCT s."cardId")
      FROM "CardStatusLog" s
     WHERE s."toStatus"::text IN (${Prisma.join([...RETURNED_STATUSES])})
       AND s."createdAt" BETWEEN ${start} AND ${end}
       AND ${inLocalRange(Prisma.sql`s."createdAt"`)}
     GROUP BY 1
  `);

  return fillDailyFlow(
    fromKey,
    range.toKey,
    rows.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
      series: row.series,
      count: Number(row.count),
    })),
  );
}
