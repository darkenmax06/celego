import { prisma } from "@/lib/prisma";
import { PROVINCIAS_INICIALES, RETURN_REASONS_DEFAULT, ZONAS } from "@/lib/constants";
import { CardStatus } from "@prisma/client";

export async function ensureBaseCatalogs() {
  await prisma.sLAConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", businessDays: 5, warningBusinessDays: 3 },
  });

  for (const p of PROVINCIAS_INICIALES) {
    await prisma.provinceConfig.upsert({
      where: { nombre: p.nombre },
      update: { zona: p.zona },
      create: { nombre: p.nombre, zona: p.zona },
    });
  }

  for (const reason of RETURN_REASONS_DEFAULT) {
    await prisma.returnReason.upsert({
      where: { nombre: reason },
      update: {},
      create: { nombre: reason },
    });
  }

  await prisma.returnReason.upsert({
    where: { nombre: "Orden anulada" },
    update: {},
    create: { nombre: "Orden anulada" },
  });

  for (const zona of [...ZONAS, "REMOTA"]) {
    await prisma.zoneTariff.upsert({
      where: { zona },
      update: {},
      create: { zona, baseCents: 0 },
    });
  }

  await prisma.billingConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", remoteSurchargeCents: 0 },
  });
}

export async function ensureDebitCardIntegrity() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Card_debit_request_dispatch_key"
    ON "Card" ("requestNumber", "dispatchDate")
    WHERE "productType" = 'DEBITO'
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'card_product_identifier_valid'
      ) THEN
        ALTER TABLE "Card"
        ADD CONSTRAINT card_product_identifier_valid CHECK (
          ("productType" = 'CREDITO' AND "tc" IS NOT NULL AND "requestNumber" IS NULL)
          OR
          ("productType" = 'DEBITO' AND "tc" = '' AND "requestNumber" IS NOT NULL AND "dispatchDate" IS NOT NULL)
        ) NOT VALID;
      END IF;
    END $$;
  `);
}

export async function normalizeLegacyRedactionSequences() {
  const redactions = await prisma.redaction.findMany({
    where: {
      items: {
        some: {
          sequence: 0,
        },
      },
    },
    select: {
      id: true,
      items: {
        select: {
          id: true,
          sequence: true,
          createdAt: true,
        },
      },
    },
  });

  for (const redaction of redactions) {
    const assignedSequences = redaction.items
      .filter((item) => item.sequence > 0)
      .map((item) => item.sequence);
    let nextSequence = assignedSequences.length ? Math.max(...assignedSequences) + 1 : 1;
    const legacyItems = redaction.items
      .filter((item) => item.sequence === 0)
      .sort((left, right) => {
        const dateDifference = left.createdAt.getTime() - right.createdAt.getTime();
        return dateDifference || left.id.localeCompare(right.id);
      });

    if (!legacyItems.length) continue;

    await prisma.$transaction(
      legacyItems.map((item) =>
        prisma.redactionItem.update({
          where: { id: item.id },
          data: { sequence: nextSequence++ },
        }),
      ),
    );
  }
}

export async function normalizeDigitalDeliveryCycles() {
  await prisma.card.updateMany({
    where: {
      status: CardStatus.ENTREGA_DIGITAL,
      digitalDeliveryCycle: 0,
    },
    data: {
      digitalDeliveryCycle: 1,
      bizcochito: false,
      bizcochitoAt: null,
    },
  });
}
