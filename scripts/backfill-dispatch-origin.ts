import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildLegacyTorreBackfillPlan,
  LEGACY_TORRE_BACKFILL_AUDIT,
  LegacyTorreBackfillAlreadyAppliedError,
  LegacyTorreBackfillValidationError,
  runLegacyTorreBackfill,
} from "@/lib/dispatch-origin-backfill";

const apply = process.argv.includes("--apply");

async function dryRun() {
  const [cards, existingKeys, marker] = await Promise.all([
    prisma.card.findMany({
      select: {
        id: true,
        tc: true,
        sourceRecordKey: true,
        dispatchDate: true,
        customer: { select: { cedula: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.card.findMany({
      where: { sourceRecordKey: { not: null } },
      select: { sourceRecordKey: true },
    }),
    prisma.auditLog.findFirst({ where: LEGACY_TORRE_BACKFILL_AUDIT, select: { id: true } }),
  ]);
  const plan = buildLegacyTorreBackfillPlan(
    cards,
    new Set(existingKeys.flatMap((card) => card.sourceRecordKey ? [card.sourceRecordKey] : [])),
  );
  return { ...plan, alreadyApplied: Boolean(marker) };
}

async function main() {
  const preflight = await dryRun();
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "dry-run", ...preflight.report, alreadyApplied: preflight.alreadyApplied }, null, 2));

  if (!apply) {
    if (!preflight.isClean || preflight.alreadyApplied) process.exitCode = 2;
    return;
  }
  if (preflight.alreadyApplied) throw new LegacyTorreBackfillAlreadyAppliedError();
  if (!preflight.isClean) throw new LegacyTorreBackfillValidationError(preflight.report);

  const report = await prisma.$transaction(
    (transaction) => runLegacyTorreBackfill(transaction),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  console.log(JSON.stringify({ mode: "applied", ...report }, null, 2));
}

main()
  .catch((error) => {
    if (error instanceof LegacyTorreBackfillValidationError) {
      console.error(JSON.stringify({ error: error.message, ...error.report }, null, 2));
      process.exitCode = 2;
      return;
    }
    if (error instanceof LegacyTorreBackfillAlreadyAppliedError) {
      console.error(JSON.stringify({ error: error.message }, null, 2));
      process.exitCode = 3;
      return;
    }
    throw error;
  })
  .finally(() => prisma.$disconnect());
