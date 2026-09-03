import { Prisma, type DispatchOrigin } from "@prisma/client";
import { buildSourceRecordKey } from "./dispatch-origin";

export const LEGACY_TORRE_BACKFILL_AUDIT = {
  entity: "CARD_BACKFILL",
  entityId: "legacy-torre-popular-v1",
  action: "APPLY",
} as const;

export type LegacyBackfillCard = {
  id: string;
  tc: string | null;
  sourceRecordKey: string | null;
  customer: { cedula: string | null } | null;
  dispatchDate: Date | null;
};

type InvalidCard = {
  cardId: string;
  reasons: string[];
};

export type LegacyTorreBackfillReport = {
  selectedCards: number;
  existingSourceKeys: number;
  missingComponents: { tc: number; cedula: number; dispatchDate: number };
  invalidCards: number;
  invalidCardDetails: InvalidCard[];
  duplicateCandidateKeys: string[];
  existingKeyCollisions: string[];
  candidateKeys: string[];
};

export type LegacyTorreBackfillCandidate = {
  cardId: string;
  sourceRecordKey: string;
};

function isMissing(value: string | Date | null | undefined) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function buildLegacyTorreSourceRecordKey(input: { tc: string; cedula: string; dispatchDate: Date }) {
  const tc = input.tc.trim();
  if (tc.includes("|") || /[\r\n]/.test(tc)) throw new Error("INVALID_TC");

  if (/^[\d\s-]+$/.test(tc)) {
    return buildSourceRecordKey({ origin: "TORRE_POPULAR", ...input, tc });
  }

  const cedula = input.cedula.replace(/\D/g, "");
  if (!/^\d{9,13}$/.test(cedula) || /^0+$/.test(cedula)) throw new Error("INVALID_CEDULA");
  if (Number.isNaN(input.dispatchDate.getTime())) throw new Error("INVALID_DISPATCH_DATE");
  return `TORRE_POPULAR|${tc}|${cedula}|${input.dispatchDate.toISOString().slice(0, 10)}`;
}

export function buildLegacyTorreBackfillPlan(
  cards: LegacyBackfillCard[],
  existingSourceKeys: ReadonlySet<string>,
) {
  const candidates: LegacyTorreBackfillCandidate[] = [];
  const invalidCardDetails: InvalidCard[] = [];
  const missingComponents = { tc: 0, cedula: 0, dispatchDate: 0 };

  for (const card of cards) {
    if (card.sourceRecordKey !== null) continue;

    const reasons: string[] = [];
    if (isMissing(card.tc)) {
      missingComponents.tc += 1;
      reasons.push("MISSING_TC");
    }
    if (isMissing(card.customer?.cedula)) {
      missingComponents.cedula += 1;
      reasons.push("MISSING_CEDULA");
    }
    if (!card.dispatchDate) {
      missingComponents.dispatchDate += 1;
      reasons.push("MISSING_DISPATCH_DATE");
    }

    if (reasons.length === 0) {
      try {
        candidates.push({
          cardId: card.id,
          sourceRecordKey: buildLegacyTorreSourceRecordKey({
            tc: card.tc!,
            cedula: card.customer!.cedula!,
            dispatchDate: card.dispatchDate!,
          }),
        });
      } catch (error) {
        reasons.push(error instanceof Error ? error.message : "INVALID_IDENTITY");
      }
    }

    if (reasons.length > 0) invalidCardDetails.push({ cardId: card.id, reasons });
  }

  const candidateKeyCounts = new Map<string, number>();
  for (const candidate of candidates) {
    candidateKeyCounts.set(candidate.sourceRecordKey, (candidateKeyCounts.get(candidate.sourceRecordKey) ?? 0) + 1);
  }
  const duplicateCandidateKeys = [...candidateKeyCounts]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
  const existingKeyCollisions = [...new Set(candidates
    .map((candidate) => candidate.sourceRecordKey)
    .filter((key) => existingSourceKeys.has(key)))]
    .sort();

  const report: LegacyTorreBackfillReport = {
    selectedCards: cards.filter((card) => card.sourceRecordKey === null).length,
    existingSourceKeys: cards.filter((card) => card.sourceRecordKey !== null).length,
    missingComponents,
    invalidCards: invalidCardDetails.length,
    invalidCardDetails,
    duplicateCandidateKeys,
    existingKeyCollisions,
    candidateKeys: candidates.map((candidate) => candidate.sourceRecordKey).sort(),
  };

  return {
    candidates,
    report,
    isClean:
      report.invalidCards === 0
      && report.duplicateCandidateKeys.length === 0
      && report.existingKeyCollisions.length === 0,
  };
}

export class LegacyTorreBackfillValidationError extends Error {
  constructor(public readonly report: LegacyTorreBackfillReport) {
    super("LEGACY_TORRE_BACKFILL_INVALID");
  }
}

export class LegacyTorreBackfillAlreadyAppliedError extends Error {
  constructor() {
    super("LEGACY_TORRE_BACKFILL_ALREADY_APPLIED");
  }
}

export async function runLegacyTorreBackfill(
  prisma: Prisma.TransactionClient,
): Promise<LegacyTorreBackfillReport> {
  await prisma.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended('celego:legacy-torre-popular-v1', 0))
  `);

  const marker = await prisma.auditLog.findFirst({
    where: LEGACY_TORRE_BACKFILL_AUDIT,
    select: { id: true },
  });
  if (marker) throw new LegacyTorreBackfillAlreadyAppliedError();

  const [cards, existingKeys] = await Promise.all([
    prisma.card.findMany({
      select: {
        id: true,
        tc: true,
        sourceRecordKey: true,
        dispatchDate: true,
        customer: { select: { cedula: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.card.findMany({
      where: { sourceRecordKey: { not: null } },
      select: { sourceRecordKey: true },
    }),
  ]);
  const plan = buildLegacyTorreBackfillPlan(
    cards,
    new Set(existingKeys.flatMap((card) => card.sourceRecordKey ? [card.sourceRecordKey] : [])),
  );
  if (!plan.isClean) throw new LegacyTorreBackfillValidationError(plan.report);

  for (const candidate of plan.candidates) {
    const result = await prisma.card.updateMany({
      where: { id: candidate.cardId, sourceRecordKey: null },
      data: { dispatchOrigin: "TORRE_POPULAR" satisfies DispatchOrigin, sourceRecordKey: candidate.sourceRecordKey },
    });
    if (result.count !== 1) throw new Error("LEGACY_TORRE_BACKFILL_CONCURRENT_CARD_CHANGE");
  }

  await prisma.auditLog.create({
    data: {
      ...LEGACY_TORRE_BACKFILL_AUDIT,
      details: {
        selectedCards: plan.report.selectedCards,
        candidateKeys: plan.report.candidateKeys,
      },
    },
  });

  return plan.report;
}
