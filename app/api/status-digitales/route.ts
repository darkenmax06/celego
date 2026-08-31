import { NextResponse } from "next/server";
import { CardStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { applyCardTransition } from "@/lib/card-transition";
import {
  compareOperationalCardRecency,
  resolveOperationalCardLookup,
  type OperationalCardResolution,
} from "@/lib/operational-card-lookup";

const itemSchema = z.object({
  fileName: z.string().min(1),
  identifier: z.string().min(1),
  isRemote: z.boolean(),
});

const schema = z.object({
  items: z.array(itemSchema).min(1).max(5000),
});

function stripExtension(value: string) {
  return value.replace(/\.[^/.]+$/, "").trim();
}

function stripRemoteTag(value: string) {
  return value.replace(/\(\s*zr\s*\)/gi, "").trim();
}

const ADDITIONAL_TAG_REGEX = /\(\s*adicional(?:\s+(\d+))?\s*\)\s*$/i;

function parseAdditionalIndex(value: string) {
  const match = value.match(ADDITIONAL_TAG_REGEX);
  if (!match) return 0;
  if (!match[1]) return 1;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

function stripAdditionalTag(value: string) {
  return value.replace(ADDITIONAL_TAG_REGEX, "").trim();
}

function stripCopySuffix(value: string) {
  return value.replace(/\s*\(\d+\)\s*$/, "").trim();
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

function parseIdentifierCandidate(raw: string) {
  const noExt = stripExtension(raw);
  const noRemote = stripRemoteTag(noExt);
  const noAdditional = stripAdditionalTag(noRemote);
  const noCopy = stripCopySuffix(noAdditional);
  return noCopy.replace(/\s+/g, " ").trim();
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
  const normalized = stripCopySuffix(stripAdditionalTag(stripRemoteTag(stripExtension(raw))));

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
      const fileAdditional = parseAdditionalIndex(stripRemoteTag(stripExtension(item.fileName)));
      const identifierAdditional = parseAdditionalIndex(stripRemoteTag(item.identifier));
      return {
        fileName: item.fileName.trim(),
        identifier: parseIdentifierCandidate(item.identifier),
        isRemote: item.isRemote,
        additionalIndex: Math.max(fileAdditional, identifierAdditional),
        dispatchDateKey: detectDispatchDateKey(item.fileName, item.identifier),
        lookupCandidates: buildLookupCandidates(item.identifier, item.fileName),
      };
    })
    .filter((item) => item.fileName && item.lookupCandidates.length);

  if (!cleanItems.length) {
    return NextResponse.json({ error: "No hay nombres de imagen validos para procesar" }, { status: 400 });
  }

  const lookupValues = Array.from(new Set(cleanItems.flatMap((item) => item.lookupCandidates)));
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
      customer: {
        select: {
          nombre: true,
          cedula: true,
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
        customer: {
          select: {
            nombre: true,
            cedula: true,
          },
        },
      },
    });
    cardsByNameMatches.push(...found);
  }

  type MatchMode =
    | "DIRECT"
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
  for (const card of [...cardsByTcOrRef, ...cardsByNameMatches]) {
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

  function findDirectCardForItem(item: (typeof cleanItems)[number]) {
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

  function resolveNameBucket(item: (typeof cleanItems)[number]) {
    const seen = new Set<string>();
    for (const candidate of item.lookupCandidates) {
      const nameKey = normalizeLookupValue(candidate);
      if (!nameKey || seen.has(nameKey)) continue;
      seen.add(nameKey);
      const bucket = cardByCustomerName.get(nameKey);
      if (bucket?.length) {
        return bucket;
      }
    }
    return null;
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

  function findCardsForItem(item: (typeof cleanItems)[number]): ResolvedSelection {
    const directMatch = findDirectCardForItem(item);
    if (directMatch) return directMatch;

    const bucket = resolveNameBucket(item);
    if (!bucket?.length) return noCardSelection();

    const ordinal = Math.max(0, item.additionalIndex);
    if (ordinal === 0 && !item.dispatchDateKey) {
      return resolvePrimaryNameWithoutDate(bucket);
    }

    type NameGroup = {
      dispatchDateKey: string;
      cards: CardRecord[];
      latestCard: CardRecord;
    };

    const groupsByKey = new Map<string, Omit<NameGroup, "latestCard">>();
    for (const card of bucket) {
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
      const resolved =
        ordinal === 0
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
  type ResolvedRow = (typeof cleanItems)[number] & {
    card: (typeof cards)[number] | null;
    matchMode: MatchMode;
    resolution: OperationalCardResolution<CardRecord>;
  };

  const resolvedRows = cleanItems.map<ResolvedRow>((item) => {
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
  }>();

  for (const item of resolvedRows) {
    if (!item.card) continue;
    const existing = groupedByCard.get(item.card.id);
    if (existing) {
      existing.isRemote = existing.isRemote || item.isRemote;
      existing.fileNames.push(item.fileName);
      existing.identifiers.push(item.identifier || item.lookupCandidates[0] || item.fileName);
    } else {
      groupedByCard.set(item.card.id, {
        card: item.card,
        isRemote: item.isRemote,
        fileNames: [item.fileName],
        identifiers: [item.identifier || item.lookupCandidates[0] || item.fileName],
      });
    }
  }

  const matchedCards = Array.from(groupedByCard.values());

  const updatePlan = matchedCards.map((entry) => {
    const card = entry.card;
    const nextStatus = card.status === CardStatus.ENTREGADA ? CardStatus.ENTREGADA : CardStatus.ENTREGA_DIGITAL;
    const nextRemote = entry.isRemote ? true : card.isRemote;
    const shouldUpdate = nextStatus !== card.status || nextRemote !== card.isRemote;
    return {
      identifier: entry.identifiers[0] ?? card.tc,
      card,
      nextStatus,
      nextRemote,
      shouldUpdate,
      fileNames: entry.fileNames,
      hasRemoteTag: entry.isRemote,
    };
  }).filter(Boolean) as Array<{
    identifier: string;
    card: (typeof cards)[number];
    nextStatus: CardStatus;
    nextRemote: boolean;
    shouldUpdate: boolean;
    fileNames: string[];
    hasRemoteTag: boolean;
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

        const updated = await applyCardTransition({
          tx,
          card: plan.card,
          nextStatus: plan.nextStatus,
          byUserId: auth.session.user.id,
          note: noteParts.join(" | "),
          data: {
            isRemote: plan.nextRemote,
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
    },
    rows,
  });
}
