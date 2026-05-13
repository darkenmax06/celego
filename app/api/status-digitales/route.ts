import { NextResponse } from "next/server";
import { CardStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

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
  const cardsByTcOrRef = await prisma.card.findMany({
    where: {
      OR: [
        { tc: { in: lookupValues } },
        { externalReference: { in: lookupValues } },
      ],
    },
    select: {
      id: true,
      tc: true,
      externalReference: true,
      status: true,
      isRemote: true,
      returnReason: true,
      createdAt: true,
      updatedAt: true,
      dispatchDate: true,
      customer: {
        select: {
          nombre: true,
          cedula: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
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
        createdAt: true,
        updatedAt: true,
        dispatchDate: true,
        customer: {
          select: {
            nombre: true,
            cedula: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    cardsByNameMatches.push(...found);
  }

  const cardById = new Map<string, (typeof cardsByTcOrRef)[number]>();
  for (const card of [...cardsByTcOrRef, ...cardsByNameMatches]) {
    if (!cardById.has(card.id)) {
      cardById.set(card.id, card);
    }
  }
  const cards = Array.from(cardById.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  const cardByTc = new Map<string, (typeof cards)[number]>();
  const cardByExternalRef = new Map<string, (typeof cards)[number]>();
  const cardByNormalized = new Map<string, (typeof cards)[number]>();
  const cardByFirst15Digits = new Map<string, Array<(typeof cards)[number]>>();
  const cardByCustomerName = new Map<string, Array<(typeof cards)[number]>>();

  for (const card of cards) {
    if (!cardByTc.has(card.tc)) {
      cardByTc.set(card.tc, card);
    }

    if (card.externalReference && !cardByExternalRef.has(card.externalReference)) {
      cardByExternalRef.set(card.externalReference, card);
    }

    const tcNormalized = normalizeLookupValue(card.tc);
    if (tcNormalized && !cardByNormalized.has(tcNormalized)) {
      cardByNormalized.set(tcNormalized, card);
    }

    if (card.externalReference) {
      const refNormalized = normalizeLookupValue(card.externalReference);
      if (refNormalized && !cardByNormalized.has(refNormalized)) {
        cardByNormalized.set(refNormalized, card);
      }
    }

    const key15 = first15Digits(card.tc);
    if (key15) {
      const existing = cardByFirst15Digits.get(key15) ?? [];
      existing.push(card);
      cardByFirst15Digits.set(key15, existing);
    }

    const customerNameKey = normalizeLookupValue(card.customer.nombre);
    if (customerNameKey) {
      const existing = cardByCustomerName.get(customerNameKey) ?? [];
      existing.push(card);
      cardByCustomerName.set(customerNameKey, existing);
    }
  }

  function findSingleCardForItem(item: (typeof cleanItems)[number]) {
    for (const candidate of item.lookupCandidates) {
      const byTc = cardByTc.get(candidate);
      if (byTc) return byTc;

      const byRef = cardByExternalRef.get(candidate);
      if (byRef) return byRef;

      const normalized = normalizeLookupValue(candidate);
      const byNormalized = normalized ? cardByNormalized.get(normalized) : undefined;
      if (byNormalized) return byNormalized;
    }

    for (const candidate of item.lookupCandidates) {
      const nameKey = normalizeLookupValue(candidate);
      if (!nameKey) continue;
      const bucket = cardByCustomerName.get(nameKey);
      if (bucket?.length === 1) {
        return bucket[0];
      }
    }

    for (const candidate of item.lookupCandidates) {
      const key15 = first15Digits(candidate);
      if (!key15) continue;
      const bucket = cardByFirst15Digits.get(key15);
      if (bucket?.length === 1) {
        return bucket[0];
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

  function findCardsForItem(item: (typeof cleanItems)[number]) {
    const directMatch = findSingleCardForItem(item);
    if (directMatch) {
      return {
        card: directMatch,
        matchMode: "DIRECT" as const,
      };
    }

    const bucket = resolveNameBucket(item);
    if (!bucket?.length) {
      return {
        card: null as (typeof cards)[number] | null,
        matchMode: "NONE" as const,
      };
    }

    type NameGroup = {
      dispatchDateKey: string;
      cards: Array<(typeof cards)[number]>;
      latestUpdatedAt: number;
    };

    const groupsByKey = new Map<string, NameGroup>();
    for (const card of bucket) {
      const dispatchKey = dateKeyUtc(card.dispatchDate);
      const key = `${normalizeCedula(card.customer.cedula)}|${dispatchKey || "SIN_FECHA"}`;
      const existing = groupsByKey.get(key);
      if (existing) {
        existing.cards.push(card);
        existing.latestUpdatedAt = Math.max(existing.latestUpdatedAt, card.updatedAt.getTime());
      } else {
        groupsByKey.set(key, {
          dispatchDateKey: dispatchKey,
          cards: [card],
          latestUpdatedAt: card.updatedAt.getTime(),
        });
      }
    }

    const groups = Array.from(groupsByKey.values()).map((group) => ({
      ...group,
      cards: [...group.cards].sort((a, b) => {
        const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
        if (byCreated !== 0) return byCreated;
        return a.id.localeCompare(b.id);
      }),
    }));

    let candidates = groups;
    if (item.dispatchDateKey) {
      const byDate = groups.filter((group) => group.dispatchDateKey === item.dispatchDateKey);
      if (byDate.length) {
        candidates = byDate;
      }
    }

    candidates = [...candidates].sort((a, b) => {
      const aKey = a.dispatchDateKey || "0000-00-00";
      const bKey = b.dispatchDateKey || "0000-00-00";
      if (aKey !== bKey) return bKey.localeCompare(aKey);
      return b.latestUpdatedAt - a.latestUpdatedAt;
    });

    const ordinal = Math.max(0, item.additionalIndex);
    let targetGroup = candidates.find((group) => group.cards.length > ordinal) ?? null;

    if (!targetGroup && ordinal === 0 && candidates.length > 0) {
      targetGroup = candidates[0];
    }

    if (!targetGroup) {
      return {
        card: null as (typeof cards)[number] | null,
        matchMode: "NONE" as const,
      };
    }

    const selected = targetGroup.cards[ordinal];
    if (!selected) {
      return {
        card: null as (typeof cards)[number] | null,
        matchMode: "NONE" as const,
      };
    }

    return {
      card: selected,
      matchMode:
        ordinal === 0
          ? (item.dispatchDateKey ? ("NOMBRE_PRINCIPAL_FECHA" as const) : ("NOMBRE_PRINCIPAL" as const))
          : (item.dispatchDateKey ? ("ADICIONAL_NOMBRE_Y_FECHA" as const) : ("ADICIONAL_NOMBRE_ORDINAL" as const)),
    };
  }

  type MatchMode =
    | "DIRECT"
    | "NONE"
    | "NOMBRE_PRINCIPAL"
    | "NOMBRE_PRINCIPAL_FECHA"
    | "ADICIONAL_NOMBRE_Y_FECHA"
    | "ADICIONAL_NOMBRE_ORDINAL";
  type ResolvedRow = (typeof cleanItems)[number] & {
    card: (typeof cards)[number] | null;
    matchMode: MatchMode;
  };

  const resolvedRows = cleanItems.map<ResolvedRow>((item) => {
    const resolved = findCardsForItem(item);
    return {
      ...item,
      card: resolved.card,
      matchMode: resolved.matchMode,
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

  if (updatePlan.length) {
    await prisma.$transaction(async (tx) => {
      for (const plan of updatePlan) {
        if (!plan.shouldUpdate) {
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

        await tx.card.update({
          where: { id: plan.card.id },
          data: {
            status: plan.nextStatus,
            isRemote: plan.nextRemote,
            returnReason:
              plan.nextStatus === CardStatus.RETORNADA || plan.nextStatus === CardStatus.DEVUELTA_TIENDA
                ? plan.card.returnReason
                : null,
          },
        });

        await tx.cardStatusLog.create({
          data: {
            cardId: plan.card.id,
            fromStatus: plan.card.status,
            toStatus: plan.nextStatus,
            note: noteParts.join(" | "),
            byUserId: auth.session.user.id,
          },
        });
      }
    });
  }

  const rows = resolvedRows.map((item) => {
    if (!item.card) {
      return {
        fileName: item.fileName,
        identifier: item.identifier || item.lookupCandidates[0] || stripExtension(item.fileName),
        found: false,
        action: "NO_ENCONTRADA",
      };
    }

    const card = item.card;
    const aggregate = groupedByCard.get(card.id);
    if (!aggregate) {
      return {
        fileName: item.fileName,
        identifier: item.identifier || item.lookupCandidates[0] || stripExtension(item.fileName),
        found: false,
        action: "NO_ENCONTRADA",
      };
    }

    const nextStatus = card.status === CardStatus.ENTREGADA ? CardStatus.ENTREGADA : CardStatus.ENTREGA_DIGITAL;
    const nextRemote = aggregate.isRemote ? true : card.isRemote;

    let action = "SIN_CAMBIOS";
    if (nextStatus !== card.status) {
      action = "STATUS_DIGITAL_APLICADO";
    } else if (card.status === CardStatus.ENTREGADA) {
      action = "ENTREGADA_SE_MANTIENE";
    }
    if (nextRemote !== card.isRemote) {
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
      statusBefore: card.status,
      statusAfter: nextStatus,
      remoteBefore: card.isRemote,
      remoteAfter: nextRemote,
      action,
    };
  });

  const matchedFiles = new Set(rows.filter((row) => row.found).map((row) => row.fileName));
  const cardsMatched = matchedFiles.size;
  const cardsNotFound = cleanItems.length - cardsMatched;
  const updatedToDigital = updatePlan.filter(
    (item) => item.shouldUpdate && item.card.status !== CardStatus.ENTREGADA && item.nextStatus === CardStatus.ENTREGA_DIGITAL,
  ).length;
  const keptDelivered = updatePlan.filter((item) => item.card.status === CardStatus.ENTREGADA).length;
  const markedRemote = updatePlan.filter((item) => item.nextRemote && !item.card.isRemote).length;
  const unchanged = updatePlan.filter((item) => !item.shouldUpdate).length;

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
      updatedToDigital,
      keptDelivered,
      markedRemote,
      unchanged,
    },
    rows,
  });
}
