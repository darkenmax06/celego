/**
 * READ-ONLY derivation of the card status transitions observed in this database.
 *
 * Prints every distinct `CardStatusLog (fromStatus, toStatus)` pair together with
 * how many times it was observed, so rare-but-real edges stay visible instead of
 * being dismissed as noise.
 *
 * Run against PRODUCTION — a development database does not carry enough history
 * to be evidence for the transition graph:
 *
 *   npx tsx scripts/derive-card-transitions.ts
 *
 * This script performs a single `groupBy` read. It never writes, updates,
 * deletes or migrates anything.
 */
import { prisma } from "@/lib/prisma";
import {
  deriveCardTransitionPairs,
  formatCardTransitionPairs,
} from "@/lib/card-transition-edges";

async function main() {
  const report = await deriveCardTransitionPairs(prisma);
  process.stdout.write(formatCardTransitionPairs(report));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
