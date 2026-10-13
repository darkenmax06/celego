/**
 * Repairs credit cards whose dispatch date was stored with day and month swapped
 * (real Excel date cells read as month-first text by the day-first parser), which
 * made cards dispatched this month show as months overdue.
 *
 * Only imported credit cards are considered. A card is corrected when its stored
 * date is implausible for its import batch time and the swapped date is plausible
 * (see detectSwappedDispatchDate). slaDueDate keeps the same number of business
 * days it had, so later SLA extensions are preserved.
 *
 * Dry-run by default. Pass --apply to write. Safe to re-run: corrected cards no
 * longer match.
 *
 *   npx tsx scripts/backfill-swapped-dispatch-dates.ts
 *   npx tsx scripts/backfill-swapped-dispatch-dates.ts --apply
 */
import { Prisma } from "@prisma/client";
import { detectSwappedDispatchDate } from "../lib/importers/swapped-dispatch-date";
import { prisma } from "../lib/prisma";
import { addBusinessDaysStrict, businessDaysBetween } from "../lib/sla";

const apply = process.argv.includes("--apply");
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

async function findCorrections() {
  const cards = await prisma.card.findMany({
    where: { dispatchOrigin: { in: ["CENTRO_ACOPIO", "TORRE_POPULAR"] }, importBatchId: { not: null } },
    select: { id: true, tc: true, status: true, dispatchDate: true, slaDueDate: true, importBatch: { select: { createdAt: true } } },
  });

  return cards.flatMap((card) => {
    if (!card.dispatchDate || !card.importBatch) return [];
    const dispatchDate = detectSwappedDispatchDate(card.dispatchDate, card.importBatch.createdAt);
    if (!dispatchDate) return [];
    const slaDueDate = card.slaDueDate
      ? addBusinessDaysStrict(dispatchDate, businessDaysBetween(card.dispatchDate, card.slaDueDate))
      : null;
    return [{ id: card.id, tc: card.tc, status: card.status, importedAt: card.importBatch.createdAt, from: { dispatchDate: card.dispatchDate, slaDueDate: card.slaDueDate }, to: { dispatchDate, slaDueDate } }];
  });
}

async function main() {
  const corrections = await findCorrections();
  const preview = corrections.map((item) => ({
    tc: item.tc,
    status: item.status,
    importedAt: iso(item.importedAt),
    dispatchDate: `${iso(item.from.dispatchDate)} -> ${iso(item.to.dispatchDate)}`,
    slaDueDate: `${iso(item.from.slaDueDate)} -> ${iso(item.to.slaDueDate)}`,
  }));

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", cards: corrections.length, preview }, null, 2));
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const item of corrections) {
        await tx.card.update({ where: { id: item.id }, data: { dispatchDate: item.to.dispatchDate, ...(item.to.slaDueDate ? { slaDueDate: item.to.slaDueDate } : {}) } });
      }
      await tx.auditLog.create({
        data: {
          entity: "CARD_BACKFILL",
          entityId: "swapped-dispatch-dates-v1",
          action: "APPLY",
          details: { updatedCards: corrections.length, cards: corrections.map((item) => ({ id: item.id, tc: item.tc, from: item.from, to: item.to })) } as Prisma.InputJsonValue,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 },
  );

  console.log(JSON.stringify({ mode: "applied", cards: corrections.length, preview }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
