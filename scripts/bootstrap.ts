import {
  ensureBaseCatalogs,
  normalizeDigitalDeliveryCycles,
  normalizeLegacyRedactionSequences,
} from "../lib/bootstrap";
import { prisma } from "../lib/prisma";

async function main() {
  const indexes: Array<{ indexname: string }> = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'Card' AND indexname ILIKE '%debit_request%'`
  );
  for (const idx of indexes) {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS public."${idx.indexname}" CASCADE`);
  }
  await ensureBaseCatalogs();
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
