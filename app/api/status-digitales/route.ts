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

function parseIdentifierCandidate(raw: string) {
  const noExt = stripExtension(raw);
  const noRemote = stripRemoteTag(noExt);
  const noCopy = stripCopySuffix(noRemote);
  return noCopy.replace(/\s+/g, " ").trim();
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
    .map((item) => ({
      fileName: item.fileName.trim(),
      identifier: parseIdentifierCandidate(item.identifier),
      isRemote: item.isRemote,
      lookupCandidates: buildLookupCandidates(item.identifier, item.fileName),
    }))
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
      updatedAt: true,
      customer: {
        select: {
          nombre: true,
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
        updatedAt: true,
        customer: {
          select: {
            nombre: true,
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

  function findCardForItem(item: (typeof cleanItems)[number]) {
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

  const resolvedRows = cleanItems.map((item) => ({
    ...item,
    card: findCardForItem(item),
  }));

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

  const cardsMatched = rows.filter((row) => row.found).length;
  const cardsNotFound = rows.length - cardsMatched;
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
