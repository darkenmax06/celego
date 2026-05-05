import { ensureBaseCatalogs } from "../lib/bootstrap";
import { prisma } from "../lib/prisma";

async function main() {
  await ensureBaseCatalogs();
  console.log("Catalogos base creados/validados.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
