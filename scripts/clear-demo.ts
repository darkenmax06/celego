import { prisma } from "../lib/prisma";

async function main() {
  const demoCards = await prisma.card.findMany({
    where: { externalReference: { startsWith: "DEMO-" } },
    select: { id: true, customerId: true },
  });
  const cardIds = demoCards.map((card) => card.id);
  const customerIds = [...new Set(demoCards.map((card) => card.customerId))];

  await prisma.$transaction(async (tx) => {
    await tx.bizcochitoBatch.deleteMany({
      where: { code: { startsWith: "BIZ-20260612-9001" } },
    });
    await tx.redaction.deleteMany({
      where: { notas: { startsWith: "DEMO:" } },
    });
    await tx.route.deleteMany({
      where: { notas: { startsWith: "DEMO:" } },
    });
    if (cardIds.length) {
      await tx.bizcochitoItem.deleteMany({ where: { cardId: { in: cardIds } } });
      await tx.cardDeliveryReassignment.deleteMany({
        where: { cardId: { in: cardIds } },
      });
      await tx.card.deleteMany({ where: { id: { in: cardIds } } });
    }
    if (customerIds.length) {
      await tx.customer.deleteMany({ where: { id: { in: customerIds } } });
    }
    await tx.auditLog.deleteMany({
      where: {
        OR: [
          { entity: "DEMO_SEED" },
          { actorEmail: { startsWith: "demo." } },
        ],
      },
    });
    await tx.user.deleteMany({
      where: { email: { startsWith: "demo." } },
    });
    await tx.messenger.deleteMany({
      where: { nombre: { startsWith: "DEMO - " } },
    });
  });

  console.log(
    `Datos DEMO retirados: ${cardIds.length} tarjetas y ${customerIds.length} clientes.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
