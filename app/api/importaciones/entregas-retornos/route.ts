import { NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { parseEntregasRetornosImport } from "@/lib/importers/entregas-retornos";
import { prisma } from "@/lib/prisma";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";
import {
  isOperationalCardClosed,
  resolveOperationalCardLookup,
} from "@/lib/operational-card-lookup";

function lookupKey(tc: string, cedula: string) {
  return `${tc}\u0000${cedula}`;
}

function cardSummary(card: {
  id: string;
  tc: string;
  status: CardStatus;
  dispatchDate: Date | null;
  returnReason: string | null;
}) {
  return {
    id: card.id,
    tc: card.tc,
    status: card.status,
    dispatchDate: card.dispatchDate,
    returnReason: card.returnReason,
  };
}

const operationalCardMutationSelect = {
  id: true,
  tc: true,
  status: true,
  returnReason: true,
  dispatchDate: true,
  createdAt: true,
  customer: {
    select: {
      cedula: true,
    },
  },
} as const;

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const parsed = parseEntregasRetornosImport(Buffer.from(await file.arrayBuffer()));
  const lookupRows = Array.from(
    new Map(parsed.rows.map((row) => [lookupKey(row.tc, row.cedula), row])).values(),
  );
  const cards = lookupRows.length
    ? await prisma.card.findMany({
        where: {
          OR: lookupRows.map((row) => ({
            tc: row.tc,
            customer: { cedula: row.cedula },
          })),
        },
        select: operationalCardMutationSelect,
      })
    : [];

  const cardsByLookup = new Map<string, typeof cards>();
  for (const card of cards) {
    const key = lookupKey(card.tc, card.customer.cedula);
    const bucket = cardsByLookup.get(key) ?? [];
    bucket.push(card);
    cardsByLookup.set(key, bucket);
  }

  const rows: Array<Record<string, unknown>> = [];
  const updatePlan: Array<{
    row: (typeof parsed.rows)[number];
    card: (typeof cards)[number];
    nextStatus: CardStatus;
  }> = [];
  let notFound = 0;
  let closedSkipped = 0;
  let ambiguous = 0;
  let concurrentSkipped = 0;

  for (const row of parsed.rows) {
    const candidates = cardsByLookup.get(lookupKey(row.tc, row.cedula)) ?? [];
    const resolution = resolveOperationalCardLookup(
      { kind: "TC", value: row.tc },
      candidates,
    );

    if (resolution.kind === "NO_ENCONTRADA") {
      notFound += 1;
      rows.push({
        tc: row.tc,
        cedula: row.cedula,
        nombre: row.nombre,
        requestedStatus: row.status,
        action: "NO_ENCONTRADA",
      });
      continue;
    }

    if (resolution.kind === "SOLO_CERRADAS") {
      closedSkipped += 1;
      rows.push({
        tc: row.tc,
        cedula: row.cedula,
        nombre: row.nombre,
        requestedStatus: row.status,
        action: "OMITIDA_TARJETA_CERRADA",
        closedCards: resolution.closedCards.map(cardSummary),
      });
      continue;
    }

    if (resolution.kind === "REQUIERE_SELECCION") {
      ambiguous += 1;
      rows.push({
        tc: row.tc,
        cedula: row.cedula,
        nombre: row.nombre,
        requestedStatus: row.status,
        action: "AMBIGUA_REQUIERE_REVISION",
        options: resolution.options.map(cardSummary),
      });
      continue;
    }

    const nextStatus = row.status === "ENTREGADA" ? CardStatus.ENTREGADA : CardStatus.RETORNADA;
    updatePlan.push({ row, card: resolution.card, nextStatus });
  }

  let updated = 0;

  for (const plan of updatePlan) {
    const outcome = await prisma.$transaction(async (tx) => {
      const currentCard = await tx.card.findUnique({
        where: { id: plan.card.id },
        select: operationalCardMutationSelect,
      });

      if (!currentCard) {
        return { kind: "NO_ENCONTRADA" as const };
      }

      if (isOperationalCardClosed(currentCard.status)) {
        return { kind: "SOLO_CERRADAS" as const, card: currentCard };
      }

      const guardedUpdate = await tx.card.updateMany({
        where: {
          id: currentCard.id,
          status: currentCard.status,
        },
        data: {
          status: plan.nextStatus,
          returnReason: plan.row.status === "RETORNADA" ? plan.row.comentario || null : null,
        },
      });

      if (guardedUpdate.count !== 1) {
        const changedCard = await tx.card.findUnique({
          where: { id: plan.card.id },
          select: operationalCardMutationSelect,
        });

        if (!changedCard) {
          return { kind: "NO_ENCONTRADA" as const };
        }

        if (isOperationalCardClosed(changedCard.status)) {
          return { kind: "SOLO_CERRADAS" as const, card: changedCard };
        }

        return { kind: "CAMBIO_CONCURRENTE" as const, card: changedCard };
      }

      await clearUrgencyOnCardClosure({
        tx,
        cardId: currentCard.id,
        nextStatus: plan.nextStatus,
        byUserId: auth.session.user.id,
      });

      await tx.cardStatusLog.create({
        data: {
          cardId: currentCard.id,
          fromStatus: currentCard.status,
          toStatus: plan.nextStatus,
          note: plan.row.comentario || "Actualizado por importacion E/R",
          byUserId: auth.session.user.id,
        },
      });

      return { kind: "ACTUALIZADA" as const, card: currentCard };
    });

    if (outcome.kind === "NO_ENCONTRADA") {
      notFound += 1;
      rows.push({
        tc: plan.row.tc,
        cedula: plan.row.cedula,
        nombre: plan.row.nombre,
        requestedStatus: plan.row.status,
        action: "NO_ENCONTRADA_DURANTE_ACTUALIZACION",
      });
      continue;
    }

    if (outcome.kind === "SOLO_CERRADAS") {
      closedSkipped += 1;
      rows.push({
        tc: plan.row.tc,
        cedula: plan.row.cedula,
        nombre: plan.row.nombre,
        requestedStatus: plan.row.status,
        action: "OMITIDA_TARJETA_CERRADA",
        phase: "DURANTE_ACTUALIZACION",
        closedCards: [cardSummary(outcome.card)],
      });
      continue;
    }

    if (outcome.kind === "CAMBIO_CONCURRENTE") {
      concurrentSkipped += 1;
      rows.push({
        tc: plan.row.tc,
        cedula: plan.row.cedula,
        nombre: plan.row.nombre,
        requestedStatus: plan.row.status,
        action: "OMITIDA_CAMBIO_CONCURRENTE",
        currentCard: cardSummary(outcome.card),
      });
      continue;
    }

    updated += 1;
    rows.push({
      tc: plan.row.tc,
      cedula: plan.row.cedula,
      nombre: plan.row.nombre,
      requestedStatus: plan.row.status,
      action: "ACTUALIZADA",
      cardId: outcome.card.id,
      statusBefore: outcome.card.status,
      statusAfter: plan.nextStatus,
    });
  }

  return NextResponse.json({
    imported: parsed.rows.length,
    updated,
    notFound,
    closedSkipped,
    ambiguous,
    concurrentSkipped,
    summary: {
      imported: parsed.rows.length,
      updated,
      notFound,
      closedSkipped,
      ambiguous,
      concurrentSkipped,
    },
    rows,
    errors: parsed.errors,
  });
}
