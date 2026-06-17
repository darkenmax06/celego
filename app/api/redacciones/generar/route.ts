import { NextResponse } from "next/server";
import { CardStatus, RedactionType } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const scannedItemSchema = z.object({
  cardId: z.string().cuid(),
  isRemote: z.boolean().optional(),
  comentario: z.string().optional(),
});

const schema = z.object({
  zona: z.string().min(2),
  fecha: z.string().optional(),
  comentario: z.string().optional(),
  entregadas: z.array(scannedItemSchema).optional(),
  retornadas: z.array(scannedItemSchema).optional(),
  type: z.nativeEnum(RedactionType).optional(),
  cardIds: z.array(z.string().cuid()).optional(),
});

function dedupeByCardId(items: Array<{ cardId: string; isRemote?: boolean; comentario?: string }>) {
  const seen = new Set<string>();
  const unique: Array<{ cardId: string; isRemote?: boolean; comentario?: string }> = [];
  for (const item of items) {
    if (seen.has(item.cardId)) continue;
    seen.add(item.cardId);
    unique.push(item);
  }
  return unique;
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  let entregadas = parsed.data.entregadas ?? [];
  let retornadas = parsed.data.retornadas ?? [];

  // Compatibilidad con payload anterior.
  if ((!entregadas.length && !retornadas.length) && parsed.data.type && parsed.data.cardIds?.length) {
    if (parsed.data.type === RedactionType.ENTREGA) {
      entregadas = parsed.data.cardIds.map((cardId) => ({ cardId }));
    } else {
      retornadas = parsed.data.cardIds.map((cardId) => ({ cardId }));
    }
  }

  entregadas = dedupeByCardId(entregadas);
  retornadas = dedupeByCardId(retornadas);

  if (!entregadas.length && !retornadas.length) {
    return NextResponse.json(
      { error: "Debe pistolear y seleccionar al menos una tarjeta para entrega o retorno" },
      { status: 400 },
    );
  }

  const overlap = entregadas.find((item) => retornadas.some((r) => r.cardId === item.cardId));
  if (overlap) {
    return NextResponse.json(
      { error: "Una tarjeta no puede estar en entrega y retorno al mismo tiempo" },
      { status: 400 },
    );
  }

  const cardIds = [...new Set([...entregadas.map((item) => item.cardId), ...retornadas.map((item) => item.cardId)])];
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true },
  });
  if (cards.length !== cardIds.length) {
    return NextResponse.json({ error: "Hay tarjetas seleccionadas que no existen" }, { status: 404 });
  }

  const targetDate = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date();

  const redactions = await prisma.$transaction(async (tx) => {
    const created: Array<{
      id: string;
      tipo: RedactionType;
      status: string;
      zona: string;
      fecha: Date;
      items: Array<{
        id: string;
        comentario: string | null;
        appliedStatus: CardStatus;
        card: { id: string; tc: string; customer: { nombre: string; cedula: string } };
      }>;
    }> = [];

    if (entregadas.length) {
      const red = await tx.redaction.create({
        data: {
          tipo: RedactionType.ENTREGA,
          zona: parsed.data.zona,
          fecha: targetDate,
          notas: parsed.data.comentario,
          items: {
            create: entregadas.map((item, index) => ({
              cardId: item.cardId,
              isRemote: item.isRemote ?? null,
              comentario: item.comentario ?? parsed.data.comentario,
              appliedStatus: CardStatus.ENTREGADA,
              sequence: index + 1,
            })),
          },
        },
        include: {
          items: {
            include: {
              card: { include: { customer: true } },
            },
          },
        },
      });
      created.push(red);
    }

    if (retornadas.length) {
      const red = await tx.redaction.create({
        data: {
          tipo: RedactionType.RETORNO,
          zona: parsed.data.zona,
          fecha: targetDate,
          notas: parsed.data.comentario,
          items: {
            create: retornadas.map((item, index) => ({
              cardId: item.cardId,
              isRemote: item.isRemote ?? null,
              comentario: item.comentario ?? parsed.data.comentario,
              appliedStatus: CardStatus.RETORNADA,
              sequence: index + 1,
            })),
          },
        },
        include: {
          items: {
            include: {
              card: { include: { customer: true } },
            },
          },
        },
      });
      created.push(red);
    }

    await tx.auditLog.create({
      data: {
        entity: "REDACTION",
        entityId: "bulk",
        action: "GENERATE",
        userId: auth.session.user.id,
        details: {
          zona: parsed.data.zona,
          fecha: targetDate.toISOString(),
          entregadas: entregadas.length,
          retornadas: retornadas.length,
        },
      },
    });

    return created;
  });

  return NextResponse.json(
    {
      redactions,
      totalItems: entregadas.length + retornadas.length,
    },
    { status: 201 },
  );
}
