/**
 * Audit (and optionally repair) violations of the TC golden rule.
 *
 *   npm run cards:audit-tc                 -> report only, touches nothing
 *   npm run cards:audit-tc -- --apply      -> restore unambiguous overwritten returns
 *   npm run cards:audit-tc -- --json       -> machine-readable report
 *
 * Run this against a LOCAL restore of the production dump first. Repairs are
 * written inside a single transaction and every change is logged in
 * CardStatusLog and AuditLog.
 */
import { prisma } from "@/lib/prisma";
import { analyzeCards, expectedTcGuard, type TcIntegrityCard } from "@/lib/tc-integrity";

const apply = process.argv.includes("--apply");
const asJson = process.argv.includes("--json");

const AUDIT_ACTION = "CARD_TC_INTEGRITY_REPAIR";

/**
 * Two populations matter: every card of a TC that was dispatched more than
 * once, and any card that carries a RETORNADA in its history — a return can be
 * overwritten in place, leaving a single-card TC that still lies about itself.
 */
async function loadCards(): Promise<TcIntegrityCard[]> {
  const [duplicated, everReturned] = await Promise.all([
    prisma.card.groupBy({
      by: ["tc"],
      _count: { _all: true },
      having: { tc: { _count: { gt: 1 } } },
    }),
    prisma.card.findMany({
      where: { logs: { some: { toStatus: "RETORNADA" } } },
      select: { tc: true },
    }),
  ]);

  const tcs = Array.from(
    new Set([...duplicated.map((group) => group.tc), ...everReturned.map((card) => card.tc)]),
  );
  if (!tcs.length) return [];

  const cards = await prisma.card.findMany({
    where: { tc: { in: tcs } },
    select: {
      id: true,
      tc: true,
      status: true,
      returnReason: true,
      currentMessengerId: true,
      dispatchDate: true,
      createdAt: true,
      logs: {
        select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return cards as TcIntegrityCard[];
}

async function main() {
  const cards = await loadCards();
  const violations = analyzeCards(cards);
  const repairable = violations.filter((violation) => violation.repair);

  if (asJson) {
    console.log(JSON.stringify({ scannedCards: cards.length, violations }, null, 2));
  } else {
    console.log(`Tarjetas analizadas (TC duplicado o con retorno en su historia): ${cards.length}`);
    console.log(`Violaciones detectadas: ${violations.length} (reparables automaticamente: ${repairable.length})`);
    for (const violation of violations) {
      console.log(`- [${violation.kind}] TC ${violation.tc} :: ${violation.detail}`);
      if (!violation.repair) console.log("    revision manual: no es un caso inequivoco");
    }
  }

  if (!apply) {
    console.log("\nModo simulacion. Volve a correr con --apply para escribir los cambios.");
    return;
  }

  const touchedTcs = new Set<string>();

  for (const violation of repairable) {
    const repair = violation.repair!;
    await prisma.$transaction(async (tx) => {
      const card = await tx.card.findUnique({
        where: { id: repair.cardId },
        select: { id: true, tc: true, status: true },
      });
      if (!card || card.status === repair.toStatus) return;

      await tx.card.update({
        where: { id: card.id },
        data: {
          status: repair.toStatus,
          returnReason: repair.returnReason,
          currentMessengerId: null,
        },
      });

      await tx.cardStatusLog.create({
        data: {
          cardId: card.id,
          fromStatus: card.status as never,
          toStatus: repair.toStatus as never,
          note: `Correccion de integridad TC: retorno original del ${repair.returnedAt.toISOString()} sobrescrito por un despacho posterior`,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AUDIT_ACTION,
          entity: "Card",
          entityId: card.id,
          details: { tc: card.tc, previousStatus: card.status, restoredTo: repair.toStatus },
        },
      });
    });
    touchedTcs.add(violation.tc);
  }

  for (const tc of touchedTcs) {
    const group = cards.filter((card) => card.tc.trim() === tc);
    const guard = expectedTcGuard(
      group.map((card) =>
        repairable.some((violation) => violation.repair?.cardId === card.id)
          ? { ...card, status: "RETORNADA" }
          : card,
      ),
    );
    await prisma.cardTcGuard.upsert({ where: { tc }, update: guard, create: { tc, ...guard } });
  }

  console.log(`\nReparadas ${repairable.length} tarjetas. Guards recalculados para ${touchedTcs.size} TCs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
