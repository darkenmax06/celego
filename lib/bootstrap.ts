import { prisma } from "@/lib/prisma";
import { PROVINCIAS_INICIALES, RETURN_REASONS_DEFAULT, ZONAS } from "@/lib/constants";
import { ensureCardTransitionPolicy } from "@/lib/card-transition-policy-store";
import { CardStatus } from "@prisma/client";

export async function ensureBaseCatalogs() {
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "Card_debit_request_dispatch_key";').catch(() => undefined);

  await prisma.sLAConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", businessDays: 5, warningBusinessDays: 3 },
  });

  await prisma.debitConsolidadoExportConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", dispatchDateFrom: null },
  });

  // Enforcement switch for the card transition graph. Seeded at SHADOW so it
  // observes without ever rejecting a write that succeeds today.
  await ensureCardTransitionPolicy();

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

function isDebitIdentityConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: unknown };
  if (candidate.code !== "P2010" || !candidate.meta || typeof candidate.meta !== "object") {
    return false;
  }
  return (candidate.meta as { code?: unknown }).code === "23505";
}

export async function ensureDebitCardIntegrity() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Card_debit_request_dispatch_key"
      ON "Card" ("requestNumber", "dispatchDate")
      WHERE "productType" = 'DEBITO'
    `);
  } catch (error) {
    if (!isDebitIdentityConflict(error)) throw error;
    console.warn(
      "No se pudo crear el indice unico de debito: existen identidades duplicadas. " +
        "Se conserva el arranque y la correccion de datos queda pendiente.",
    );
  }

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
