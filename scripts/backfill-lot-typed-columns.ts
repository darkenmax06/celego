import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import {
  buildLotItemDateBackfillPlan,
  buildLotStatusBackfillPlan,
  type LotItemDateBackfillRow,
} from "@/lib/lot-typed-backfill";

/**
 * SDD change `rutas-lotes-redesign` — Slice 3 (task 4, batch-added).
 *
 * Backfills the typed columns added in this slice for EXISTING historical
 * rows: `Lot.estatusTipo` and `LotItem.recibidaAt`/`retornadaAt`. Dry-run by
 * default; `--apply` performs the writes. Cursor-paged over both tables so
 * it can run online against a large production dataset without loading
 * everything into memory at once. Idempotent: a row already carrying a typed
 * value is left untouched by the pure planners in `lib/lot-typed-backfill.ts`,
 * so re-running this script is always safe.
 *
 * NOT executed against any real database by the sdd-apply executor (hard
 * safety constraint: no live/production DB connection is permitted). This is
 * the script a human operator (or CI with real credentials) runs later —
 * mirrors `scripts/backfill-dispatch-origin.ts`'s dry-run/--apply shape.
 *
 * `LotItem` has no historical event timestamp anywhere in the schema, so
 * `recibidaAt`/`retornadaAt` cannot be recovered exactly. This script uses
 * the best available real signal: the linked Card's most recent matching
 * `CardStatusLog` row (`toStatus: ACUSE_RECIBIDO` for `recibidaAt`,
 * `toStatus: DEVUELTA_TIENDA` for `retornadaAt`). When no such log exists —
 * e.g. the card was deleted, unlinked, or the log predates this schema —
 * the row is report-and-skip: left null, listed in the report, and does not
 * block other rows.
 */

const apply = process.argv.includes("--apply");
const batchArg = process.argv.find((arg) => arg.startsWith("--batch="));
const batchSize = batchArg ? Number(batchArg.slice("--batch=".length)) || 500 : 500;

type LotStatusReport = ReturnType<typeof buildLotStatusBackfillPlan>;
type LotItemDateReport = ReturnType<typeof buildLotItemDateBackfillPlan>;

async function planLotStatus(): Promise<LotStatusReport> {
  const updates: LotStatusReport["updates"] = [];
  const unmappedByValue = new Map<string, { count: number; sampleIds: string[] }>();

  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.lot.findMany({
      where: { estatusTipo: null },
      select: { id: true, estatus: true, estatusTipo: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;

    const batchPlan = buildLotStatusBackfillPlan(rows);
    updates.push(...batchPlan.updates);
    for (const entry of batchPlan.unmapped) {
      const existing = unmappedByValue.get(entry.value) ?? { count: 0, sampleIds: [] };
      existing.count += entry.count;
      existing.sampleIds.push(...entry.sampleIds.slice(0, Math.max(0, 5 - existing.sampleIds.length)));
      unmappedByValue.set(entry.value, existing);
    }

    if (apply && batchPlan.updates.length) {
      await prisma.$transaction(
        batchPlan.updates.map((update) =>
          prisma.lot.update({ where: { id: update.id }, data: { estatusTipo: update.estatusTipo } }),
        ),
      );
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }

  return { updates, unmapped: Array.from(unmappedByValue, ([value, entry]) => ({ value, ...entry })) };
}

async function planLotItemDates(): Promise<LotItemDateReport> {
  const updates: LotItemDateReport["updates"] = [];
  const skipped: LotItemDateReport["skipped"] = [];

  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.lotItem.findMany({
      where: {
        AND: [
          { OR: [{ recibida: { not: null } }, { retornada: { not: null } }] },
          { OR: [{ recibidaAt: null }, { retornadaAt: null }] },
        ],
      },
      select: { id: true, cardId: true, recibida: true, retornada: true, recibidaAt: true, retornadaAt: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;

    const cardIds = Array.from(new Set(rows.flatMap((row) => (row.cardId ? [row.cardId] : []))));
    const logs = cardIds.length
      ? await prisma.cardStatusLog.findMany({
          where: { cardId: { in: cardIds }, toStatus: { in: ["ACUSE_RECIBIDO", "DEVUELTA_TIENDA"] } },
          select: { cardId: true, toStatus: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const latestByCardAndStatus = new Map<string, Date>();
    for (const log of logs) {
      const key = `${log.cardId}:${log.toStatus}`;
      if (!latestByCardAndStatus.has(key)) latestByCardAndStatus.set(key, log.createdAt);
    }

    const rowByCardId = new Map(rows.filter((row) => row.cardId).map((row) => [row.id, row.cardId as string]));
    const resolveTimestamp = (row: LotItemDateBackfillRow, field: "recibidaAt" | "retornadaAt") => {
      const cardId = rowByCardId.get(row.id);
      if (!cardId) return null;
      const status = field === "recibidaAt" ? "ACUSE_RECIBIDO" : "DEVUELTA_TIENDA";
      return latestByCardAndStatus.get(`${cardId}:${status}`) ?? null;
    };

    const batchPlan = buildLotItemDateBackfillPlan(rows, resolveTimestamp);
    updates.push(...batchPlan.updates);
    skipped.push(...batchPlan.skipped);

    if (apply && batchPlan.updates.length) {
      await prisma.$transaction(
        batchPlan.updates.map((update) =>
          prisma.lotItem.update({
            where: { id: update.id },
            data: { recibidaAt: update.recibidaAt, retornadaAt: update.retornadaAt },
          }),
        ),
      );
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }

  return { updates, skipped };
}

async function main() {
  const [lotStatusReport, lotItemDateReport] = await Promise.all([planLotStatus(), planLotItemDates()]);

  const report = {
    mode: apply ? "applied" : "dry-run",
    lotStatus: {
      updated: lotStatusReport.updates.length,
      unmapped: lotStatusReport.unmapped,
    },
    lotItemDates: {
      updated: lotItemDateReport.updates.length,
      skipped: lotItemDateReport.skipped,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const reportPath = `backfill-lot-typed-columns-report-${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
