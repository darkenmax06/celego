/**
 * Loads the 2024-07 → 2025-12 monthly closes (credit mass deliveries) as
 * historical cards already in their final status.
 *
 * Historical cards stay out of live operations: no SLA due date, no messenger,
 * no payroll credit, no bizcochito cycle, never urgent. Each TC guard ends on
 * its last historical delivery unless a live card already owns it.
 *
 * Dry-run by default. Pass --apply to write. Re-running skips cards whose
 * source record key already exists. --rollback removes only the cards of the
 * labeled historical batches (also dry-run unless --apply).
 *
 *   npm run cards:import-historical
 *   npm run cards:import-historical -- --apply
 *   npm run cards:import-historical -- --file /tmp/historico.csv --apply
 *   npm run cards:import-historical -- --rollback --apply
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CardStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recalculateAdditionalCardsForGroups } from "@/lib/card-additional";
import { resolveNormalizedImportLocation, upsertCustomerPreservingData } from "@/lib/card-service";
import {
  buildHistoricalCards,
  HISTORICAL_BATCH_LABEL,
  parseHistoricalCsv,
  planDeliveredGuards,
  type HistoricalCard,
  type HistoricalRejection,
} from "@/lib/importers/historical-masivas";

const CHUNK = 500;
const LOCK_KEY = "celego:import-historical-masivas-2024-2025";
const AUDIT_ENTITY = "CARD_HISTORICAL_IMPORT";

const apply = process.argv.includes("--apply");
const rollback = process.argv.includes("--rollback");
const fileArg = process.argv.indexOf("--file");
const filePath = fileArg >= 0 ? process.argv[fileArg + 1] : "output/historico-masivas/historico_listo_para_importar.csv";

function chunks<T>(items: T[], size = CHUNK) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

async function lock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK_KEY}, 0))`);
}

async function historicalBatchIds() {
  const batches = await prisma.cardImportBatch.findMany({ where: { label: HISTORICAL_BATCH_LABEL }, select: { id: true } });
  return batches.map((batch) => batch.id);
}

async function existingKeys(cards: HistoricalCard[]) {
  const found = new Set<string>();
  for (const part of chunks(cards)) {
    const rows = await prisma.card.findMany({
      where: { sourceRecordKey: { in: part.map((card) => card.sourceRecordKey) } },
      select: { sourceRecordKey: true },
    });
    for (const row of rows) if (row.sourceRecordKey) found.add(row.sourceRecordKey);
  }
  return found;
}

function locate(card: HistoricalCard) {
  return resolveNormalizedImportLocation({ origin: card.origin, provincia: card.provincia, zona: card.zona });
}

async function ensureBatch(origin: HistoricalCard["origin"], fileHash: string, rowCount: number) {
  const sha256 = `${fileHash}:${origin}`;
  return prisma.cardImportBatch.upsert({
    where: { sha256 },
    update: {},
    create: { origin, sha256, originalName: filePath.split(/[\\/]/).pop() ?? filePath, label: HISTORICAL_BATCH_LABEL, rowCount },
  });
}

async function insertCards(cards: HistoricalCard[], batchByOrigin: Map<string, string>) {
  let created = 0;
  let skipped = 0;
  for (const part of chunks(cards)) {
    const result = await prisma.$transaction(
      async (tx) => {
        await lock(tx);
        let partCreated = 0;
        let partSkipped = 0;
        for (const card of part) {
          if (await tx.card.findUnique({ where: { sourceRecordKey: card.sourceRecordKey }, select: { id: true } })) {
            partSkipped += 1;
            continue;
          }
          const { province, zone } = locate(card);
          const { customer } = await upsertCustomerPreservingData(tx, { cedula: card.cedula, nombre: card.nombre, provincia: province, zona: zone });
          const row = await tx.card.create({
            data: {
              tc: card.tc,
              customerId: customer.id,
              zona: zone,
              provincia: province ?? zone,
              dispatchDate: card.dispatchDate,
              status: card.status as CardStatus,
              isRemote: card.isRemote,
              dispatchOrigin: card.origin,
              sourceRecordKey: card.sourceRecordKey,
              importBatchId: batchByOrigin.get(card.origin),
              slaDueDate: null,
              urgent: false,
              digitalDeliveryCycle: 0,
              bizcochito: false,
              metadata: card.metadata as Prisma.InputJsonValue,
            },
          });
          await tx.cardStatusLog.create({
            data: { cardId: row.id, fromStatus: null, toStatus: card.status as CardStatus, note: `Importacion historica (cierre ${card.metadata.historical.period})`, createdAt: card.dispatchDate },
          });
          partCreated += 1;
        }
        return { partCreated, partSkipped };
      },
      { timeout: 300_000, maxWait: 60_000 },
    );
    created += result.partCreated;
    skipped += result.partSkipped;
    console.error(`  ... ${created + skipped}/${cards.length}`);
  }
  return { created, skipped };
}

/**
 * Points each delivered TC's guard at its last historical delivery. A guard
 * already owned by a live card, or a TC that has any non-historical card, is
 * left alone so live dispatch rules keep deciding for it.
 */
async function applyGuards(plan: Map<string, string>, batchIds: string[]) {
  let set = 0;
  let leftToLive = 0;
  const entries = [...plan.entries()];
  for (const part of chunks(entries)) {
    await prisma.$transaction(
      async (tx) => {
        await lock(tx);
        const tcs = part.map(([tc]) => tc);
        const [targets, liveCards] = await Promise.all([
          tx.card.findMany({ where: { sourceRecordKey: { in: part.map(([, key]) => key) } }, select: { id: true, sourceRecordKey: true } }),
          tx.card.findMany({ where: { tc: { in: tcs }, OR: [{ importBatchId: null }, { importBatchId: { notIn: batchIds } }] }, select: { tc: true } }),
        ]);
        const idByKey = new Map(targets.map((card) => [card.sourceRecordKey, card.id]));
        const liveTcs = new Set(liveCards.map((card) => card.tc));
        for (const [tc, key] of part) {
          const cardId = idByKey.get(key);
          if (!cardId) continue;
          if (liveTcs.has(tc)) {
            leftToLive += 1;
            continue;
          }
          // No live card has this TC, so any id already on the guard is historical (never open) or dangling.
          await tx.cardTcGuard.upsert({
            where: { tc },
            update: { deliveredCardId: cardId, activeCardId: null },
            create: { tc, deliveredCardId: cardId },
          });
          set += 1;
        }
      },
      { timeout: 300_000, maxWait: 60_000 },
    );
  }
  return { set, leftToLive };
}

async function recalculateAdditionals(cards: HistoricalCard[]) {
  let updated = 0;
  for (const part of chunks(cards.map((card) => ({ customerCedula: card.cedula, dispatchDate: card.dispatchDate })))) {
    const result = await recalculateAdditionalCardsForGroups(part);
    updated += result.updated;
  }
  return updated;
}

function rejectionReport(rejected: HistoricalRejection[]) {
  return { total: rejected.length, byCode: countBy(rejected, (row) => row.code), examples: rejected.slice(0, 20) };
}

async function runImport() {
  const bytes = readFileSync(filePath);
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const rows = parseHistoricalCsv(bytes.toString("utf8"));
  const { cards, rejected } = buildHistoricalCards(rows);

  // Zone resolution happens here too, so a dry run already shows every row that would be refused.
  const unresolved: HistoricalRejection[] = [];
  const loadable = cards.filter((card) => {
    if (locate(card).zone) return true;
    unresolved.push({ line: card.line, code: "UNRESOLVED_ZONE", message: `Zona no resuelta: provincia ${card.provincia ?? "vacia"}, zona ${card.zona}`, tcLast4: `****${card.tc.slice(-4)}` });
    return false;
  });
  const existing = await existingKeys(loadable);
  const pending = loadable.filter((card) => !existing.has(card.sourceRecordKey));
  const plan = planDeliveredGuards(loadable);

  const base = {
    file: filePath,
    rowsRead: rows.length,
    rejected: rejectionReport([...rejected, ...unresolved]),
    alreadyImported: existing.size,
    byStatus: countBy(pending, (card) => card.status),
    byOrigin: countBy(pending, (card) => card.origin),
    tcsWithDeliveredGuard: plan.size,
  };

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", wouldCreate: pending.length, ...base }, null, 2));
    return;
  }

  const batchByOrigin = new Map<string, string>();
  for (const [origin, count] of Object.entries(countBy(loadable, (card) => card.origin))) {
    const batch = await ensureBatch(origin as HistoricalCard["origin"], fileHash, count);
    batchByOrigin.set(origin, batch.id);
  }

  const inserted = await insertCards(pending, batchByOrigin);
  const guards = await applyGuards(plan, await historicalBatchIds());
  const additionalsUpdated = await recalculateAdditionals(pending);

  for (const batchId of batchByOrigin.values()) {
    const createdCount = await prisma.card.count({ where: { importBatchId: batchId } });
    await prisma.cardImportBatch.update({ where: { id: batchId }, data: { status: "COMPLETED", createdCount, completedAt: new Date() } });
  }

  const report = { mode: "applied", ...base, created: inserted.created, skippedExisting: existing.size + inserted.skipped, guards, additionalsUpdated };
  await prisma.auditLog.create({
    data: { entity: AUDIT_ENTITY, entityId: HISTORICAL_BATCH_LABEL, action: "APPLY", details: { ...report, rejected: { total: report.rejected.total, byCode: report.rejected.byCode } } },
  });
  console.log(JSON.stringify(report, null, 2));
}

async function runRollback() {
  const batchIds = await historicalBatchIds();
  const cards = await prisma.card.findMany({ where: { importBatchId: { in: batchIds } }, select: { id: true } });
  const ids = cards.map((card) => card.id);
  const survey = { batches: batchIds.length, cards: ids.length };

  if (!apply) {
    console.log(JSON.stringify({ mode: "rollback-dry-run", ...survey }, null, 2));
    return;
  }

  for (const part of chunks(ids)) {
    await prisma.$transaction(
      async (tx) => {
        await lock(tx);
        await tx.cardTcGuard.updateMany({ where: { deliveredCardId: { in: part } }, data: { deliveredCardId: null } });
        await tx.cardTcGuard.updateMany({ where: { activeCardId: { in: part } }, data: { activeCardId: null } });
        await tx.card.deleteMany({ where: { id: { in: part } } });
      },
      { timeout: 300_000, maxWait: 60_000 },
    );
  }
  await prisma.cardImportBatch.deleteMany({ where: { id: { in: batchIds } } });
  await prisma.auditLog.create({ data: { entity: AUDIT_ENTITY, entityId: HISTORICAL_BATCH_LABEL, action: "ROLLBACK", details: survey } });
  console.log(JSON.stringify({ mode: "rolled-back", ...survey }, null, 2));
}

(rollback ? runRollback() : runImport())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
