import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { parseUrgentesImport } from "@/lib/importers/urgentes";
import { prisma } from "@/lib/prisma";
import {
  getActiveUrgentCase,
  nextUrgentNotificationAt,
  urgentStatusLabel,
} from "@/lib/urgent-alerts";

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

  let linked = 0;
  for (const row of parsed.rows) {
    const card = await prisma.card.findFirst({
      where: {
        OR: [{ tc: row.tc }, { customer: { cedula: row.cedula } }],
      },
      orderBy: { createdAt: "desc" },
    });

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
      continue;
    }

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
  }

  return NextResponse.json({
    imported: parsed.rows.length,
    linked,
    errors: parsed.errors,
  });
}
