import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { parseUrgentesImport } from "@/lib/importers/urgentes";
import { prisma } from "@/lib/prisma";
import {
  getActiveUrgentCase,
  nextUrgentNotificationAt,
  urgentStatusLabel,
} from "@/lib/urgent-alerts";
import { resolveOperationalCardLookup } from "@/lib/operational-card-lookup";

function lookupKey(tc: string, cedula: string) {
  return `${tc}\u0000${cedula}`;
}

function cardSummary(card: {
  id: string;
  tc: string;
  status: string;
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

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const parsed = parseUrgentesImport(Buffer.from(await file.arrayBuffer()));
  const defaultLevel = 3;
  const now = new Date();

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
        select: {
          id: true,
          tc: true,
          status: true,
          urgent: true,
          dispatchDate: true,
          createdAt: true,
          returnReason: true,
          customer: { select: { cedula: true } },
        },
      })
    : [];
  const cardsByLookup = new Map<string, typeof cards>();
  for (const card of cards) {
    const key = lookupKey(card.tc, card.customer.cedula);
    const bucket = cardsByLookup.get(key) ?? [];
    bucket.push(card);
    cardsByLookup.set(key, bucket);
  }

  let linked = 0;
  let notFound = 0;
  let closedSkipped = 0;
  let ambiguous = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const row of parsed.rows) {
    const candidates = cardsByLookup.get(lookupKey(row.tc, row.cedula)) ?? [];
    const resolution = resolveOperationalCardLookup({ kind: "TC", value: row.tc }, candidates);
    const card = resolution.kind === "RESUELTA" ? resolution.card : null;

    if (resolution.kind === "SOLO_CERRADAS") {
      closedSkipped += 1;
      rows.push({
        tc: row.tc,
        cedula: row.cedula,
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
        action: "AMBIGUA_REQUIERE_REVISION",
        options: resolution.options.map(cardSummary),
      });
      continue;
    }

    if (card) {
      linked += 1;
      const activeCase = await getActiveUrgentCase(card.id);
      const nextNotificationAt = nextUrgentNotificationAt(defaultLevel, now);
      const immediateNotificationAt = now;
      const shouldNotifyNow = !card.urgent || !activeCase;

      if (activeCase) {
        await prisma.urgentCase.update({
          where: { id: activeCase.id },
          data: {
            tc: row.tc,
            cedula: row.cedula,
            provincia: row.provincia,
            telefono: row.telefono,
            direccion: row.direccion,
            status: row.status || urgentStatusLabel(defaultLevel),
            level: defaultLevel,
            nextNotificationAt:
              shouldNotifyNow
                ? immediateNotificationAt
                : (activeCase.nextNotificationAt ?? nextNotificationAt),
            resolvedAt: null,
            resolvedById: null,
          },
        });
      } else {
        await prisma.urgentCase.create({
          data: {
            cardId: card.id,
            tc: row.tc,
            cedula: row.cedula,
            provincia: row.provincia,
            telefono: row.telefono,
            status: row.status || urgentStatusLabel(defaultLevel),
            direccion: row.direccion,
            level: defaultLevel,
            createdById: auth.session.user.id,
            nextNotificationAt: immediateNotificationAt,
          },
        });
      }

      if (!card.urgent) {
        await prisma.card.update({
          where: { id: card.id },
          data: { urgent: true },
        });
        await prisma.cardStatusLog.create({
          data: {
            cardId: card.id,
            fromStatus: card.status,
            toStatus: card.status,
            note: "Marcada como urgente por importacion (Nivel 3).",
            byUserId: auth.session.user.id,
          },
        });
      }
      rows.push({
        tc: row.tc,
        cedula: row.cedula,
        action: "VINCULADA",
        cardId: card.id,
      });
      continue;
    }

    notFound += 1;
    await prisma.urgentCase.create({
      data: {
        cardId: null,
        tc: row.tc,
        cedula: row.cedula,
        provincia: row.provincia,
        telefono: row.telefono,
        status: row.status || urgentStatusLabel(defaultLevel),
        direccion: row.direccion,
        level: defaultLevel,
        createdById: auth.session.user.id,
      },
    });
    rows.push({
      tc: row.tc,
      cedula: row.cedula,
      action: "CREADA_SIN_TARJETA",
    });
  }

  return NextResponse.json({
    imported: parsed.rows.length,
    linked,
    notFound,
    closedSkipped,
    ambiguous,
    summary: {
      imported: parsed.rows.length,
      linked,
      notFound,
      closedSkipped,
      ambiguous,
    },
    rows,
    errors: parsed.errors,
  });
}
