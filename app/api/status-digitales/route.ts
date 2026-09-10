import { NextResponse } from "next/server";
import { CardStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { applyCardTransition } from "@/lib/card-transition";
import { peelFileTags } from "@/lib/contract-image";
import {
  compareOperationalCardRecency,
  resolveOperationalCardLookup,
  type OperationalCardResolution,
} from "@/lib/operational-card-lookup";

const itemSchema = z.object({
  fileName: z.string().min(1),
  identifier: z.string().min(1),
  isRemote: z.boolean(),
  overrideCardId: z.string().min(1).optional(),
});

// Tarjetas en estos estados no cuentan como candidatas para disparar una
// ambiguedad por nombre: ya estan cerradas para este flujo (retornada) o ya
// fueron resueltas (entregada/entrega digital), asi que no deben forzar al
// operador a elegir entre ellas y la tarjeta realmente pendiente.
const NAME_AMBIGUITY_EXCLUDED_STATUSES = new Set<CardStatus>([
  CardStatus.RETORNADA,
  CardStatus.DEVUELTA_TIENDA,
  CardStatus.ENTREGADA,
  CardStatus.ENTREGA_DIGITAL,
]);

const schema = z.object({
  items: z.array(itemSchema).min(1).max(5000),
});

function stripExtension(value: string) {
  return value.replace(/\.[^/.]+$/, "").trim();
}

function normalizeLookupValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s\-_]+/g, "")
    .trim()
    .toUpperCase();
}

function normalizeCedula(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits || raw.trim().toUpperCase();
}

// SDD contrato-tarjetas-pistoleo (design D5): delegates to the shared
// `peelFileTags` trailing-tag peeler so `(C)` (contract image marker) is
// stripped the same way `(zr)` / `(adicional N)` / `(N)` already are, and the
// resulting identifier still resolves to the same card as the delivery image.
function parseIdentifierCandidate(raw: string) {
  return peelFileTags(raw).base.replace(/\s+/g, " ").trim();
}

function dateKeyUtc(date: Date | null | undefined) {
  if (!date) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDateKey(year: number, month: number, day: number) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDispatchDateKey(raw: string) {
  const normalized = peelFileTags(raw).base;

  const ymd = normalized.match(/\b(20\d{2})[\/._-](0?[1-9]|1[0-2])[\/._-](0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) {
    const key = toDateKey(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (key) return key;
  }

  const dmy = normalized.match(/\b(0?[1-9]|[12]\d|3[01])[\/._-](0?[1-9]|1[0-2])[\/._-]((?:19|20)\d{2})\b/);
  if (dmy) {
    const key = toDateKey(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    if (key) return key;
  }

  const ymdCompact = normalized.match(/\b(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])\b/);
  if (ymdCompact) {
    const key = toDateKey(Number(ymdCompact[1]), Number(ymdCompact[2]), Number(ymdCompact[3]));
    if (key) return key;
  }

  return null;
}

function detectDispatchDateKey(fileName: string, identifier: string) {
  return parseDispatchDateKey(fileName) ?? parseDispatchDateKey(identifier);
}

function buildLookupCandidates(identifier: string, fileName: string) {
  const candidates = new Set<string>();

  const baseFromIdentifier = parseIdentifierCandidate(identifier);
  const baseFromFileName = parseIdentifierCandidate(fileName);

  for (const base of [baseFromIdentifier, baseFromFileName]) {
    if (!base) continue;
    candidates.add(base);
    candidates.add(base.replace(/\s+/g, ""));
    candidates.add(base.replace(/[\s\-_]+/g, ""));

    if (base.includes("|")) {
      const leftPart = base.split("|")[0]?.trim() ?? "";
      if (leftPart) {
        candidates.add(leftPart);
        candidates.add(leftPart.replace(/\s+/g, ""));
      }
    }
  }

  const finalCandidates = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    finalCandidates.add(trimmed);

    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 13) {
      finalCandidates.add(digits);
      // Algunos Excel redondean el ultimo digito de tarjetas largas a 0.
      if (digits.length >= 16) {
        finalCandidates.add(`${digits.slice(0, 15)}0`);
      }
    }
  }

  return Array.from(finalCandidates);
}

function expandDatabaseLookupValues(values: readonly string[]) {
  const expanded = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    expanded.add(trimmed);

    const withoutSeparators = trimmed.replace(/[\s\-_]+/g, "");
    if (withoutSeparators) {
      expanded.add(withoutSeparators);
    }
  }

  return Array.from(expanded);
}

function first15Digits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 15) return "";
  return digits.slice(0, 15);
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const cleanItems = parsed.data.items
    .map((item) => {
      const fileTags = peelFileTags(item.fileName);
      const identifierTags = peelFileTags(item.identifier);
      return {
        fileName: item.fileName.trim(),
        identifier: parseIdentifierCandidate(item.identifier),
        isRemote: item.isRemote,
        overrideCardId: item.overrideCardId,
        additionalIndex: Math.max(fileTags.additionalIndex, identifierTags.additionalIndex),
        // SDD contrato-tarjetas-pistoleo: `(C)` on either the fileName or the
        // identifier marks this image as the contract image rather than the
        // delivery image for the same card.
        isContract: fileTags.isContract || identifierTags.isContract,
        dispatchDateKey: detectDispatchDateKey(item.fileName, item.identifier),
        lookupCandidates: buildLookupCandidates(item.identifier, item.fileName),
      };
    })
    .filter((item) => item.fileName && (item.overrideCardId || item.lookupCandidates.length));

  // A batch that carries "NOMBRE (adicional N)" alongside a bare "NOMBRE"
  // already says which card each image belongs to, so the untagged file is the
  // principal and must not stop the operator with an ambiguity prompt.
  const additionalSiblingKeys = new Set(
    cleanItems
      .filter((item) => item.additionalIndex > 0)
      .flatMap((item) => item.lookupCandidates.map(normalizeLookupValue).filter(Boolean)),
  );
  const batchItems = cleanItems.map((item) => ({
    ...item,
    hasAdditionalSiblingInBatch:
      item.additionalIndex === 0 &&
      item.lookupCandidates.some((candidate) =>
        additionalSiblingKeys.has(normalizeLookupValue(candidate)),
      ),
  }));

  if (!cleanItems.length) {
    return NextResponse.json({ error: "No hay nombres de imagen validos para procesar" }, { status: 400 });
  }

  const lookupValues = Array.from(new Set(batchItems.flatMap((item) => item.lookupCandidates)));
  const databaseLookupValues = expandDatabaseLookupValues(lookupValues);
  const cardsByTcOrRef = await prisma.card.findMany({
    where: {
      OR: [
        { tc: { in: databaseLookupValues, mode: "insensitive" } },
        { externalReference: { in: databaseLookupValues, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      tc: true,
      externalReference: true,
      status: true,
      isRemote: true,
      returnReason: true,
      digitalDeliveryCycle: true,
      createdAt: true,
      dispatchDate: true,
      hasContract: true,
      contractImageAt: true,
      contractImageFile: true,
      customer: {
        select: {
          nombre: true,
          cedula: true,
          provincia: true,
        },
      },
    },
  });

  const nameLookupValues = Array.from(
    new Set(
      cleanItems
        .map((item) => item.identifier)
        .filter((value) => /[A-Za-zÀ-ÿ]/.test(value)),
    ),
  );

  const cardsByNameMatches: typeof cardsByTcOrRef = [];
  for (const batch of chunkArray(nameLookupValues, 150)) {
    if (!batch.length) continue;
    const found = await prisma.card.findMany({
      where: {
        OR: batch.map((name) => ({
          customer: {
            nombre: {
              equals: name,
              mode: "insensitive",
            },
          },
        })),
      },
      select: {
        id: true,
        tc: true,
        externalReference: true,
        status: true,
        isRemote: true,
        returnReason: true,
        digitalDeliveryCycle: true,
        createdAt: true,
        dispatchDate: true,
        hasContract: true,
        contractImageAt: true,
        contractImageFile: true,
        customer: {
          select: {
            nombre: true,
            cedula: true,
            provincia: true,
          },
        },
      },
    });
    cardsByNameMatches.push(...found);
  }

  const overrideCardIds = Array.from(
    new Set(cleanItems.map((item) => item.overrideCardId).filter((value): value is string => Boolean(value))),
  );
  const cardsByOverride = overrideCardIds.length
    ? await prisma.card.findMany({
        where: { id: { in: overrideCardIds } },
        select: {
          id: true,
          tc: true,
          externalReference: true,
          status: true,
          isRemote: true,
          returnReason: true,
          digitalDeliveryCycle: true,
          createdAt: true,
          dispatchDate: true,
          hasContract: true,
          contractImageAt: true,
          contractImageFile: true,
          customer: {
            select: {
              nombre: true,
              cedula: true,
              provincia: true,
            },
          },
        },
      })
    : [];

  type MatchMode =
    | "DIRECT"
    | "MANUAL"
    | "NONE"
    | "NOMBRE_PRINCIPAL"
    | "NOMBRE_PRINCIPAL_FECHA"
    | "ADICIONAL_NOMBRE_Y_FECHA"
    | "ADICIONAL_NOMBRE_ORDINAL";
  type CardRecord = (typeof cardsByTcOrRef)[number];
  type ResolvedSelection = {
    card: CardRecord | null;
    matchMode: MatchMode;
    resolution: OperationalCardResolution<CardRecord>;
  };

  const cardById = new Map<string, CardRecord>();
  for (const card of [...cardsByTcOrRef, ...cardsByNameMatches, ...cardsByOverride]) {
    if (!cardById.has(card.id)) {
      cardById.set(card.id, card);
    }
  }
  const cards = Array.from(cardById.values()).sort(compareOperationalCardRecency);

  const cardByTc = new Map<string, CardRecord[]>();
  const cardByExternalRef = new Map<string, CardRecord[]>();
  const cardByNormalizedTc = new Map<string, CardRecord[]>();
  const cardByNormalizedRef = new Map<string, CardRecord[]>();
  const cardByFirst15Digits = new Map<string, CardRecord[]>();
  const cardByCustomerName = new Map<string, CardRecord[]>();

  function addToBucket(bucket: Map<string, CardRecord[]>, key: string, card: CardRecord) {
    if (!key) return;
    const existing = bucket.get(key) ?? [];
    existing.push(card);
    bucket.set(key, existing);
  }

  for (const card of cards) {
    addToBucket(cardByTc, card.tc, card);
    if (card.externalReference) {
      addToBucket(cardByExternalRef, card.externalReference, card);
    }

    addToBucket(cardByNormalizedTc, normalizeLookupValue(card.tc), card);
    if (card.externalReference) {
      addToBucket(cardByNormalizedRef, normalizeLookupValue(card.externalReference), card);
    }

    const key15 = first15Digits(card.tc);
    if (key15) addToBucket(cardByFirst15Digits, key15, card);

    addToBucket(cardByCustomerName, normalizeLookupValue(card.customer.nombre), card);
  }

  function toResolvedSelection(
    resolution: OperationalCardResolution<CardRecord>,
    matchMode: MatchMode,
  ): ResolvedSelection {
    return {
      card: resolution.kind === "RESUELTA" ? resolution.card : null,
      matchMode,
      resolution,
    };
  }

  function noCardSelection(): ResolvedSelection {
    return toResolvedSelection({ kind: "NO_ENCONTRADA" }, "NONE");
  }

  function resolveBucket(
    kind: "TC" | "REFERENCIA" | "CEDULA",
    value: string,
    bucket: CardRecord[],
    matchMode: MatchMode,
  ) {
    return toResolvedSelection(
      resolveOperationalCardLookup({ kind, value }, bucket),
      matchMode,
    );
  }

  function findDirectCardForItem(item: (typeof batchItems)[number]) {
    for (const candidate of item.lookupCandidates) {
      const byTc = cardByTc.get(candidate);
      if (byTc?.length) return resolveBucket("TC", candidate, byTc, "DIRECT");

      const byRef = cardByExternalRef.get(candidate);
      if (byRef?.length) return resolveBucket("REFERENCIA", candidate, byRef, "DIRECT");

      const normalized = normalizeLookupValue(candidate);
      if (!normalized) continue;

      const byNormalizedTc = cardByNormalizedTc.get(normalized);
      if (byNormalizedTc?.length) {
        return resolveBucket("TC", candidate, byNormalizedTc, "DIRECT");
      }

      const byNormalizedRef = cardByNormalizedRef.get(normalized);
      if (byNormalizedRef?.length) {
        return resolveBucket("REFERENCIA", candidate, byNormalizedRef, "DIRECT");
      }
    }

    for (const candidate of item.lookupCandidates) {
      const key15 = first15Digits(candidate);
      if (!key15) continue;
      const bucket = cardByFirst15Digits.get(key15);
      if (!bucket?.length) continue;

      const tcValues = Array.from(
        new Map(bucket.map((card) => [normalizeLookupValue(card.tc), card.tc])).values(),
      );
      if (tcValues.length === 1) {
        return resolveBucket("TC", tcValues[0], bucket, "DIRECT");
      }
    }

    return null;
  }

  /**
   * Resolving one ambiguity re-posts the whole batch, so the images processed
   * in the previous pass come back with their card already closed for this
   * flow. Those must report as "already closed", never as "not found", or the
   * operator is told to re-validate work that in fact succeeded.
   */
  function resolveNameBucket(item: (typeof batchItems)[number]) {
    const seen = new Set<string>();
    let closedFallback: CardRecord[] | null = null;
    for (const candidate of item.lookupCandidates) {
      const nameKey = normalizeLookupValue(candidate);
      if (!nameKey || seen.has(nameKey)) continue;
      seen.add(nameKey);
      const bucket = cardByCustomerName.get(nameKey);
      if (!bucket?.length) continue;

      const openBucket = bucket.filter((card) => !NAME_AMBIGUITY_EXCLUDED_STATUSES.has(card.status));
      if (openBucket.length) return { cards: openBucket, allCards: bucket, allClosed: false };
      closedFallback ??= bucket;
    }
    return closedFallback ? { cards: closedFallback, allCards: closedFallback, allClosed: true } : null;
  }

  function resolvePrimaryNameWithoutDate(bucket: CardRecord[]): ResolvedSelection {
    const resolutions = Array.from(
      new Set(bucket.map((card) => card.customer.cedula).filter(Boolean)),
    ).map((cedula) =>
      resolveOperationalCardLookup({ kind: "CEDULA", value: cedula }, bucket),
    );

    const openOptions = Array.from(
      new Map(
        resolutions.flatMap((resolution) => {
          if (resolution.kind === "RESUELTA") return [[resolution.card.id, resolution.card]];
          if (resolution.kind === "REQUIERE_SELECCION") {
            return resolution.options.map((card) => [card.id, card] as const);
          }
          return [];
        }),
      ).values(),
    ).sort(compareOperationalCardRecency);

    if (openOptions.length === 1) {
      return toResolvedSelection(
        { kind: "RESUELTA", card: openOptions[0] },
        "NOMBRE_PRINCIPAL",
      );
    }

    if (openOptions.length > 1) {
      return toResolvedSelection(
        { kind: "REQUIERE_SELECCION", options: openOptions },
        "NOMBRE_PRINCIPAL",
      );
    }

    const closedCards = Array.from(
      new Map(
        resolutions.flatMap((resolution) =>
          resolution.kind === "SOLO_CERRADAS"
            ? resolution.closedCards.map((card) => [card.id, card] as const)
            : [],
        ),
      ).values(),
    ).sort(compareOperationalCardRecency);

    return closedCards.length
      ? toResolvedSelection({ kind: "SOLO_CERRADAS", closedCards }, "NOMBRE_PRINCIPAL")
      : noCardSelection();
  }

  function findCardsForItem(item: (typeof batchItems)[number]): ResolvedSelection {
    if (item.overrideCardId) {
      const card = cardById.get(item.overrideCardId);
      return card
        ? toResolvedSelection({ kind: "RESUELTA", card }, "MANUAL")
        : noCardSelection();
    }

    const directMatch = findDirectCardForItem(item);
    if (directMatch) return directMatch;

    const nameBucket = resolveNameBucket(item);
    if (!nameBucket) return noCardSelection();
    if (nameBucket.allClosed) {
      return toResolvedSelection(
        { kind: "SOLO_CERRADAS", closedCards: [...nameBucket.cards].sort(compareOperationalCardRecency) },
        "NOMBRE_PRINCIPAL",
      );
    }
    const bucket = nameBucket.cards;
    // "(adicional N)" counts positions in the customer's whole card set. Ranking
    // only the still-open cards makes those positions slide as deliveries land,
    // so an ordinal lookup reads the full set and reports an already-closed hit
    // instead of silently landing on its neighbour.
    const ordinalBucket = nameBucket.allCards;

    // A sibling "(adicional N)" file settles WHICH CARD of one customer an
    // image belongs to. It says nothing about WHICH CUSTOMER when the name is
    // shared by several people, so homonyms must still reach the operator.
    const batchDisambiguates =
      item.hasAdditionalSiblingInBatch &&
      new Set(ordinalBucket.map((card) => normalizeCedula(card.customer.cedula))).size === 1;

    const ordinal = Math.max(0, item.additionalIndex);
    if (ordinal === 0 && !item.dispatchDateKey && !batchDisambiguates) {
      return resolvePrimaryNameWithoutDate(bucket);
    }

    type NameGroup = {
      dispatchDateKey: string;
      cards: CardRecord[];
      latestCard: CardRecord;
    };

    const groupsByKey = new Map<string, Omit<NameGroup, "latestCard">>();
    for (const card of ordinalBucket) {
      const dispatchKey = dateKeyUtc(card.dispatchDate);
      const key = `${normalizeCedula(card.customer.cedula)}|${dispatchKey || "SIN_FECHA"}`;
      const existing = groupsByKey.get(key);
      if (existing) {
        existing.cards.push(card);
      } else {
        groupsByKey.set(key, {
          dispatchDateKey: dispatchKey,
          cards: [card],
        });
      }
    }

    const groups = Array.from(groupsByKey.values()).map<NameGroup>((group) => {
      const groupCards = [...group.cards].sort((a, b) => {
        const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
        if (byCreated !== 0) return byCreated;
        return a.id.localeCompare(b.id);
      });
      return {
        ...group,
        cards: groupCards,
        latestCard: [...groupCards].sort(compareOperationalCardRecency)[0],
      };
    });

    let candidateGroups = groups;
    if (item.dispatchDateKey) {
      const byDate = groups.filter((group) => group.dispatchDateKey === item.dispatchDateKey);
      if (!byDate.length) return noCardSelection();
      candidateGroups = byDate;
    }

    candidateGroups = [...candidateGroups].sort((a, b) => {
      const aKey = a.dispatchDateKey || "0000-00-00";
      const bKey = b.dispatchDateKey || "0000-00-00";
      if (aKey !== bKey) return bKey.localeCompare(aKey);
      return compareOperationalCardRecency(a.latestCard, b.latestCard);
    });

    let closedSelection: ResolvedSelection | null = null;
    for (const targetGroup of candidateGroups) {
      const selected = targetGroup.cards[ordinal];
      if (!selected) continue;

      const matchMode =
        ordinal === 0
          ? (item.dispatchDateKey ? ("NOMBRE_PRINCIPAL_FECHA" as const) : ("NOMBRE_PRINCIPAL" as const))
          : (item.dispatchDateKey ? ("ADICIONAL_NOMBRE_Y_FECHA" as const) : ("ADICIONAL_NOMBRE_ORDINAL" as const));
      // A cedula lookup re-opens the very ambiguity the batch already settled,
      // so once a sibling file claims the additional, pin the principal by its
      // own TC just like the additional ordinals do.
      const resolved =
        ordinal === 0 && !batchDisambiguates
          ? resolveBucket("CEDULA", selected.customer.cedula, targetGroup.cards, matchMode)
          : resolveBucket("TC", selected.tc, targetGroup.cards, matchMode);

      if (resolved.resolution.kind === "SOLO_CERRADAS") {
        closedSelection ??= resolved;
        continue;
      }

      return resolved;
    }

    return closedSelection ?? noCardSelection();
  }
  type ResolvedRow = (typeof batchItems)[number] & {
    card: (typeof cards)[number] | null;
    matchMode: MatchMode;
    resolution: OperationalCardResolution<CardRecord>;
  };

  const resolvedRows = batchItems.map<ResolvedRow>((item) => {
    const resolved = findCardsForItem(item);
    return {
      ...item,
      card: resolved.card,
      matchMode: resolved.matchMode,
      resolution: resolved.resolution,
    };
  });

  const groupedByCard = new Map<string, {
    card: NonNullable<(typeof resolvedRows)[number]["card"]>;
    isRemote: boolean;
    fileNames: string[];
    identifiers: string[];
    // SDD contrato-tarjetas-pistoleo (design D6): a card's batch entry can
    // carry both a delivery image and a `(C)` contract image; both strip to
    // the same identifier and are grouped here without new pairing logic.
    kinds: { delivery: string[]; contract: string[] };
  }>();

  for (const item of resolvedRows) {
    if (!item.card) continue;
    const bucket = item.isContract ? "contract" : "delivery";
    const existing = groupedByCard.get(item.card.id);
    if (existing) {
      existing.isRemote = existing.isRemote || item.isRemote;
      existing.fileNames.push(item.fileName);
      existing.identifiers.push(item.identifier || item.lookupCandidates[0] || item.fileName);
      existing.kinds[bucket].push(item.fileName);
    } else {
      groupedByCard.set(item.card.id, {
        card: item.card,
        isRemote: item.isRemote,
        fileNames: [item.fileName],
        identifiers: [item.identifier || item.lookupCandidates[0] || item.fileName],
        kinds: { delivery: bucket === "delivery" ? [item.fileName] : [], contract: bucket === "contract" ? [item.fileName] : [] },
      });
    }
  }

  const matchedCards = Array.from(groupedByCard.values());

  const updatePlan = matchedCards.map((entry) => {
    const card = entry.card;
    const hasDeliveryImage = entry.kinds.delivery.length > 0;
    const hasContractImage = entry.kinds.contract.length > 0;
    const contractAlreadySatisfied = Boolean(card.contractImageAt);

    // SDD contrato-tarjetas-pistoleo (spec: contract-image-intake,
    // contract-exception-states). `hasContract=false` cards ALWAYS take the
    // original single-branch path below, byte-identical to pre-feature
    // behavior — contract images for those cards are treated exactly like
    // any other delivery image.
    let nextStatus: CardStatus = card.status;
    if (card.status === CardStatus.ENTREGADA) {
      nextStatus = CardStatus.ENTREGADA;
    } else if (!card.hasContract) {
      nextStatus = CardStatus.ENTREGA_DIGITAL;
    } else if (hasDeliveryImage) {
      nextStatus =
        hasContractImage || contractAlreadySatisfied
          ? CardStatus.ENTREGA_DIGITAL
          : CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO;
    } else if (hasContractImage) {
      // Contract-only upload: only resolves an already-pending exception.
      nextStatus =
        card.status === CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO
          ? CardStatus.ENTREGA_DIGITAL
          : card.status;
    }

    const nextRemote = entry.isRemote ? true : card.isRemote;
    const setsContractImage = card.hasContract && hasContractImage && !contractAlreadySatisfied;
    const nextContractImageAt = setsContractImage ? new Date() : (card.contractImageAt ?? null);
    const nextContractImageFile = setsContractImage
      ? (entry.kinds.contract[entry.kinds.contract.length - 1] ?? null)
      : (card.contractImageFile ?? null);
    const shouldUpdate = nextStatus !== card.status || nextRemote !== card.isRemote || setsContractImage;

    return {
      identifier: entry.identifiers[0] ?? card.tc,
      card,
      nextStatus,
      nextRemote,
      shouldUpdate,
      fileNames: entry.fileNames,
      hasRemoteTag: entry.isRemote,
      setsContractImage,
      nextContractImageAt,
      nextContractImageFile,
    };
  }).filter(Boolean) as Array<{
    identifier: string;
    card: (typeof cards)[number];
    nextStatus: CardStatus;
    nextRemote: boolean;
    shouldUpdate: boolean;
    fileNames: string[];
    hasRemoteTag: boolean;
    setsContractImage: boolean;
    nextContractImageAt: Date | null;
    nextContractImageFile: string | null;
  }>;

  type UpdateOutcome =
    | {
        kind: "ACTUALIZADA" | "SIN_CAMBIOS";
        statusBefore: CardStatus;
        statusAfter: CardStatus;
        remoteBefore: boolean;
        remoteAfter: boolean;
      }
    | {
        kind: "CERRADA_DURANTE_PROCESAMIENTO";
        card: CardRecord;
      }
    | {
        kind: "CAMBIO_CONCURRENTE";
        status: CardStatus | null;
      };

  const updateOutcomes = new Map<string, UpdateOutcome>();

  if (updatePlan.length) {
    await prisma.$transaction(async (tx) => {
      for (const plan of updatePlan) {
        if (!plan.shouldUpdate) {
          updateOutcomes.set(plan.card.id, {
            kind: "SIN_CAMBIOS",
            statusBefore: plan.card.status,
            statusAfter: plan.card.status,
            remoteBefore: plan.card.isRemote,
            remoteAfter: plan.card.isRemote,
          });
          continue;
        }

        // Claim the exact state we resolved before mutating it. The conditional
        // write both detects a concurrent status change and holds the row lock
        // through the transition, so a return cannot be overwritten by this batch.
        const claim = await tx.card.updateMany({
          where: {
            id: plan.card.id,
            status: plan.card.status,
            isRemote: plan.card.isRemote,
            digitalDeliveryCycle: plan.card.digitalDeliveryCycle,
            contractImageAt: plan.card.contractImageAt,
          },
          data: {
            updatedAt: new Date(),
          },
        });

        if (!claim.count) {
          const current = await tx.card.findUnique({
            where: { id: plan.card.id },
            select: {
              status: true,
              isRemote: true,
              returnReason: true,
              dispatchDate: true,
              createdAt: true,
              digitalDeliveryCycle: true,
            },
          });

          if (
            current &&
            (current.status === CardStatus.RETORNADA || current.status === CardStatus.DEVUELTA_TIENDA)
          ) {
            updateOutcomes.set(plan.card.id, {
              kind: "CERRADA_DURANTE_PROCESAMIENTO",
              card: {
                ...plan.card,
                status: current.status,
                isRemote: current.isRemote,
                returnReason: current.returnReason,
                dispatchDate: current.dispatchDate,
                createdAt: current.createdAt,
                digitalDeliveryCycle: current.digitalDeliveryCycle,
              },
            });
          } else {
            updateOutcomes.set(plan.card.id, {
              kind: "CAMBIO_CONCURRENTE",
              status: current?.status ?? null,
            });
          }
          continue;
        }

        const noteParts = [
          "Actualizada por Status Digitales",
          plan.nextStatus !== plan.card.status
            ? `status ${plan.card.status} -> ${plan.nextStatus}`
            : "status sin cambio",
          plan.nextRemote !== plan.card.isRemote
            ? "marcada como zona remota"
            : "zona remota sin cambio",
        ];
        if (plan.setsContractImage) {
          noteParts.push("imagen de contrato registrada");
        }

        const updated = await applyCardTransition({
          tx,
          card: plan.card,
          nextStatus: plan.nextStatus,
          byUserId: auth.session.user.id,
          note: noteParts.join(" | "),
          data: {
            isRemote: plan.nextRemote,
            ...(plan.setsContractImage
              ? { contractImageAt: plan.nextContractImageAt, contractImageFile: plan.nextContractImageFile }
              : {}),
          },
        });

        updateOutcomes.set(plan.card.id, {
          kind: "ACTUALIZADA",
          statusBefore: plan.card.status,
          statusAfter: updated.status,
          remoteBefore: plan.card.isRemote,
          remoteAfter: updated.isRemote,
        });
      }
    });
  }

  function operationalCardDetails(card: CardRecord) {
    return {
      id: card.id,
      tc: card.tc,
      externalReference: card.externalReference,
      status: card.status,
      dispatchDate: card.dispatchDate,
      createdAt: card.createdAt,
      returnReason: card.returnReason,
      customer: card.customer,
    };
  }

  const rows = resolvedRows.map((item) => {
    if (!item.card) {
      const base = {
        fileName: item.fileName,
        identifier: item.identifier || item.lookupCandidates[0] || stripExtension(item.fileName),
        found: false,
      };
      if (item.resolution.kind === "SOLO_CERRADAS") {
        return {
          ...base,
          action: "OMITIDA_TARJETA_CERRADA",
          closedCards: item.resolution.closedCards.map(operationalCardDetails),
        };
      }
      if (item.resolution.kind === "REQUIERE_SELECCION") {
        return {
          ...base,
          action: "AMBIGUA_REQUIERE_REVISION",
          options: item.resolution.options.map(operationalCardDetails),
        };
      }
      return {
        ...base,
        action: "NO_ENCONTRADA",
      };
    }

    const card = item.card;
    const base = {
      fileName: item.fileName,
      identifier: item.identifier || item.lookupCandidates[0] || card.tc,
      found: false,
    };
    const outcome = updateOutcomes.get(card.id);
    if (outcome?.kind === "CERRADA_DURANTE_PROCESAMIENTO") {
      return {
        ...base,
        action: "OMITIDA_TARJETA_CERRADA",
        closedCards: [operationalCardDetails(outcome.card)],
      };
    }
    if (outcome?.kind === "CAMBIO_CONCURRENTE") {
      return {
        ...base,
        action: "OMITIDA_CAMBIO_CONCURRENTE",
        statusActual: outcome.status,
      };
    }

    const aggregate = groupedByCard.get(card.id);
    if (!aggregate) {
      return {
        ...base,
        action: "NO_ENCONTRADA",
      };
    }

    const statusBefore = outcome?.statusBefore ?? card.status;
    const statusAfter = outcome?.statusAfter ??
      (statusBefore === CardStatus.ENTREGADA ? CardStatus.ENTREGADA : CardStatus.ENTREGA_DIGITAL);
    const remoteBefore = outcome?.remoteBefore ?? card.isRemote;
    const remoteAfter = outcome?.remoteAfter ?? (aggregate.isRemote ? true : remoteBefore);

    let action = "SIN_CAMBIOS";
    if (statusAfter !== statusBefore) {
      action = "STATUS_DIGITAL_APLICADO";
    } else if (statusBefore === CardStatus.ENTREGADA) {
      action = "ENTREGADA_SE_MANTIENE";
    }
    if (remoteAfter !== remoteBefore) {
      action = action === "SIN_CAMBIOS" ? "MARCADA_ZONA_REMOTA" : `${action} + ZONA_REMOTA`;
    }
    if (item.matchMode === "ADICIONAL_NOMBRE_Y_FECHA") {
      action = action === "SIN_CAMBIOS" ? "ADICIONAL_NOMBRE_Y_FECHA" : `${action} + ADICIONAL_NOMBRE_Y_FECHA`;
    } else if (item.matchMode === "ADICIONAL_NOMBRE_ORDINAL") {
      action = action === "SIN_CAMBIOS" ? "ADICIONAL_NOMBRE_ORDINAL" : `${action} + ADICIONAL_NOMBRE_ORDINAL`;
    } else if (item.matchMode === "NOMBRE_PRINCIPAL_FECHA") {
      action = action === "SIN_CAMBIOS" ? "NOMBRE_PRINCIPAL_FECHA" : `${action} + NOMBRE_PRINCIPAL_FECHA`;
    } else if (item.matchMode === "NOMBRE_PRINCIPAL") {
      action = action === "SIN_CAMBIOS" ? "NOMBRE_PRINCIPAL" : `${action} + NOMBRE_PRINCIPAL`;
    } else if (item.matchMode === "MANUAL") {
      action = action === "SIN_CAMBIOS" ? "SELECCION_MANUAL" : `${action} + SELECCION_MANUAL`;
    }
    if (statusAfter === CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO) {
      action = action === "SIN_CAMBIOS" ? "SIN_CONTRATO_PENDIENTE" : `${action} + SIN_CONTRATO_PENDIENTE`;
    }

    return {
      fileName: item.fileName,
      identifier: item.identifier || item.lookupCandidates[0] || card.tc,
      found: true,
      cardId: card.id,
      statusBefore,
      statusAfter,
      remoteBefore,
      remoteAfter,
      action,
      customer: card.customer,
      provincia: card.customer.provincia,
    };
  });

  const matchedFiles = new Set(rows.filter((row) => row.found).map((row) => row.fileName));
  const cardsMatched = matchedFiles.size;
  const cardsNotFound = rows.filter((row) => row.action === "NO_ENCONTRADA").length;
  const closedSkipped = rows.filter((row) => row.action === "OMITIDA_TARJETA_CERRADA").length;
  const ambiguous = rows.filter((row) => row.action === "AMBIGUA_REQUIERE_REVISION").length;
  const concurrencySkipped = rows.filter((row) => row.action === "OMITIDA_CAMBIO_CONCURRENTE").length;
  const completedOutcomes = Array.from(updateOutcomes.values()).filter(
    (outcome): outcome is Extract<UpdateOutcome, { kind: "ACTUALIZADA" | "SIN_CAMBIOS" }> =>
      outcome.kind === "ACTUALIZADA" || outcome.kind === "SIN_CAMBIOS",
  );
  const updatedToDigital = completedOutcomes.filter(
    (outcome) =>
      outcome.kind === "ACTUALIZADA" &&
      outcome.statusBefore !== CardStatus.ENTREGA_DIGITAL &&
      outcome.statusAfter === CardStatus.ENTREGA_DIGITAL,
  ).length;
  const keptDelivered = completedOutcomes.filter(
    (outcome) => outcome.statusBefore === CardStatus.ENTREGADA,
  ).length;
  const markedRemote = completedOutcomes.filter(
    (outcome) => outcome.remoteAfter && !outcome.remoteBefore,
  ).length;
  const unchanged = completedOutcomes.filter((outcome) => outcome.kind === "SIN_CAMBIOS").length;
  // SDD contrato-tarjetas-pistoleo (spec: contract-image-intake). Cards
  // diverted to ENTREGA_DIGITAL_SIN_CONTRATO because their batch had a
  // delivery image but no matching `(C)` contract image.
  const contractWarnings = completedOutcomes.filter(
    (outcome) => outcome.statusAfter === CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO,
  ).length;
  const contractWarningCards = rows
    .filter((row) => row.action.includes("SIN_CONTRATO_PENDIENTE"))
    .map((row) => row.identifier);

  await prisma.auditLog.create({
    data: {
      entity: "DIGITAL_STATUS",
      entityId: "batch",
      action: "APPLY",
      userId: auth.session.user.id,
      details: {
        filesReceived: cleanItems.length,
        uniqueIdentifiers: lookupValues.length,
        cardsMatched,
        cardsNotFound,
        closedSkipped,
        ambiguous,
        concurrencySkipped,
        updatedToDigital,
        keptDelivered,
        markedRemote,
        contractWarnings,
      } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    summary: {
      filesReceived: cleanItems.length,
      uniqueIdentifiers: lookupValues.length,
      cardsMatched,
      cardsNotFound,
      closedSkipped,
      ambiguous,
      concurrencySkipped,
      updatedToDigital,
      keptDelivered,
      markedRemote,
      unchanged,
      contractWarnings,
    },
    contractWarningCards,
    rows,
  });
}
