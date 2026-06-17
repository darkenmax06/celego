import {
  ensureBaseCatalogs,
  normalizeDigitalDeliveryCycles,
  normalizeLegacyRedactionSequences,
} from "../lib/bootstrap";
import { prisma } from "../lib/prisma";

async function main() {
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
