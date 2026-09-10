/**
 * One-shot backfill: assign TORRE_POPULAR to legacy cards that have no
 * dispatch origin, so they stop being rejected by redaction admission.
 *
 * Scope is deliberately narrow: it only writes `dispatchOrigin` on rows where
 * it is NULL. It never touches `sourceRecordKey`, and it never overwrites an
 * origin that already exists (BPD_DEBITO cards are created with an origin but
 * no source key, so filtering by source key would silently relabel them).
 *
 * Dry-run by default. Pass --apply to write. Runs at most once: an audit
 * marker row makes a second apply fail fast.
 *
 *   npx tsx scripts/backfill-legacy-dispatch-origin.ts
 *   npx tsx scripts/backfill-legacy-dispatch-origin.ts --apply
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const TARGET_ORIGIN = "TORRE_POPULAR" as const;

const BACKFILL_AUDIT = {
  entity: "CARD_BACKFILL",
  entityId: "legacy-missing-origin-torre-popular-v1",
  action: "APPLY",
} as const;

const apply = process.argv.includes("--apply");

async function survey() {
  const [missingOrigin, byOrigin, marker, sample] = await Promise.all([
    prisma.card.count({ where: { dispatchOrigin: null } }),
    prisma.card.groupBy({ by: ["dispatchOrigin"], _count: { _all: true } }),
    prisma.auditLog.findFirst({ where: BACKFILL_AUDIT, select: { id: true, createdAt: true } }),
    prisma.card.findMany({
      where: { dispatchOrigin: null },
      select: { id: true, tc: true, productType: true, dispatchDate: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
  ]);

  return {
    missingOrigin,
    currentDistribution: Object.fromEntries(
      byOrigin.map((row) => [row.dispatchOrigin ?? "NULL", row._count._all]),
    ),
    sample,
    alreadyApplied: marker,
  };
}

async function main() {
  const report = await survey();

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", willSet: TARGET_ORIGIN, ...report }, null, 2));
    if (report.alreadyApplied) process.exitCode = 3;
    return;
  }

  if (report.alreadyApplied) {
    console.error(JSON.stringify({ error: "ALREADY_APPLIED", ...report.alreadyApplied }, null, 2));
    process.exitCode = 3;
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // Serialize against a concurrent run of this same backfill.
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended('celego:legacy-missing-origin-torre-popular-v1', 0))
      `);

      const marker = await tx.auditLog.findFirst({ where: BACKFILL_AUDIT, select: { id: true } });
      if (marker) throw new Error("ALREADY_APPLIED");

      const updated = await tx.card.updateMany({
        where: { dispatchOrigin: null },
        data: { dispatchOrigin: TARGET_ORIGIN },
      });

      await tx.auditLog.create({
        data: {
          ...BACKFILL_AUDIT,
          details: { origin: TARGET_ORIGIN, updatedCards: updated.count },
        },
      });

      return updated.count;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  console.log(JSON.stringify({ mode: "applied", origin: TARGET_ORIGIN, updatedCards: result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
