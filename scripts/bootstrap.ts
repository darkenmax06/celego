import {
  ensureBaseCatalogs,
  ensureDebitCardIntegrity,
  normalizeDigitalDeliveryCycles,
  normalizeLegacyRedactionSequences,
} from "../lib/bootstrap";
import { prisma } from "../lib/prisma";

async function main() {
  // Drop only legacy variants; the canonical debit identity index must survive
  // restarts or duplicate debit cards slip in between boots.
  const indexes: Array<{ indexname: string }> = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'Card' AND indexname ILIKE '%debit_request%' AND indexname <> 'Card_debit_request_dispatch_key'`
  );
  for (const idx of indexes) {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS public."${idx.indexname}" CASCADE`);
  }
  await ensureBaseCatalogs();
  await ensureDebitCardIntegrity();
  await normalizeLegacyRedactionSequences();
  await normalizeDigitalDeliveryCycles();
  console.log("Catalogos base, secuencias y ciclos digitales creados/validados.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
