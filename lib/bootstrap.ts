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

  // NOTE: the `card_product_identifier_valid` CHECK constraint used to be created
  // here. It required DEBITO cards to carry `tc = ''`, but every write path in
  // this codebase stores the request number in `tc` for debit cards
  // (`persistDebitConsolidadoImport`, `debit-despacho`, `debit-consolidado`), so
  // the constraint rejected every debit card the app itself created.
  //
  // Migrating debit cards to `tc = ''` is not a viable fix either: `CardTcGuard`
  // uses `tc` as its primary key and `activeCardId` is unique, so an empty `tc`
  // would collapse every debit card onto a single guard row.
  //
  // Reconciling the debit identity model (identify debit by `requestNumber` and
  // stop keying the guard on `tc`) is tracked separately. Until then this
  // constraint is not created, and any leftover copy is dropped below.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Card" DROP CONSTRAINT IF EXISTS card_product_identifier_valid
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
