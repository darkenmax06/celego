import { recalculateAllCardAdditionals } from "../lib/card-additional";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await recalculateAllCardAdditionals();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

