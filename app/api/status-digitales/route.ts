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
      identifier: item.identifier.trim(),
      isRemote: item.isRemote,
    }))
    .filter((item) => item.fileName && item.identifier);

  if (!cleanItems.length) {
    return NextResponse.json({ error: "No hay nombres de imagen validos para procesar" }, { status: 400 });
  }

  const grouped = new Map<string, { isRemote: boolean; fileNames: string[] }>();
  for (const item of cleanItems) {
    const existing = grouped.get(item.identifier);
    if (existing) {
      existing.isRemote = existing.isRemote || item.isRemote;
      existing.fileNames.push(item.fileName);
    } else {
      grouped.set(item.identifier, { isRemote: item.isRemote, fileNames: [item.fileName] });
    }
  }

  const identifiers = Array.from(grouped.keys());
  const cards = await prisma.card.findMany({
    where: { tc: { in: identifiers } },
    select: {
      id: true,
      tc: true,
      status: true,
      isRemote: true,
      returnReason: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const cardByTc = new Map<string, (typeof cards)[number]>();
  for (const card of cards) {
    if (!cardByTc.has(card.tc)) {
      cardByTc.set(card.tc, card);
    }
  }

  const updatePlan = identifiers.map((identifier) => {
    const card = cardByTc.get(identifier);
    const bucket = grouped.get(identifier);
    if (!card || !bucket) return null;
    const nextStatus = card.status === CardStatus.ENTREGADA ? CardStatus.ENTREGADA : CardStatus.ENTREGA_DIGITAL;
    const nextRemote = bucket.isRemote ? true : card.isRemote;
    const shouldUpdate = nextStatus !== card.status || nextRemote !== card.isRemote;
    return {
      identifier,
      card,
      nextStatus,
      nextRemote,
      shouldUpdate,
      fileNames: bucket.fileNames,
      hasRemoteTag: bucket.isRemote,
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

  const rows = cleanItems.map((item) => {
    const card = cardByTc.get(item.identifier);
    const aggregate = grouped.get(item.identifier);
    if (!card || !aggregate) {
      return {
        fileName: item.fileName,
        identifier: item.identifier,
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
      identifier: item.identifier,
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
        uniqueIdentifiers: identifiers.length,
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
      uniqueIdentifiers: identifiers.length,
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
