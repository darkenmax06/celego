import { NextResponse } from "next/server";
import { CardStatus, DispatchOrigin, RedactionType } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const item = z.object({ cardId: z.string().cuid(), isRemote: z.boolean().optional(), comentario: z.string().optional() });
const schema = z.object({ zona: z.string().min(2), fecha: z.string().optional(), comentario: z.string().optional(), entregadas: z.array(item).optional(), retornadas: z.array(item).optional(), type: z.nativeEnum(RedactionType).optional(), cardIds: z.array(z.string().cuid()).optional() });

type Item = z.infer<typeof item>;
function unique(items: Item[]) { return [...new Map(items.map((row) => [row.cardId, row])).values()]; }

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  let entregadas = parsed.data.entregadas ?? [];
  let retornadas = parsed.data.retornadas ?? [];
  if (!entregadas.length && !retornadas.length && parsed.data.type && parsed.data.cardIds?.length) {
    if (parsed.data.type === RedactionType.ENTREGA) entregadas = parsed.data.cardIds.map((cardId) => ({ cardId }));
    else retornadas = parsed.data.cardIds.map((cardId) => ({ cardId }));
  }
  entregadas = unique(entregadas); retornadas = unique(retornadas);
  if (!entregadas.length && !retornadas.length) return NextResponse.json({ error: "Debe seleccionar al menos una tarjeta" }, { status: 400 });
  if (entregadas.some((row) => retornadas.some((other) => other.cardId === row.cardId))) return NextResponse.json({ error: "Una tarjeta no puede estar en entrega y retorno al mismo tiempo" }, { status: 400 });

  const all = [...entregadas, ...retornadas];
  const cards = await prisma.card.findMany({ where: { id: { in: all.map((row) => row.cardId) } }, select: { id: true, dispatchOrigin: true } });
  if (cards.length !== all.length) return NextResponse.json({ error: "Hay tarjetas seleccionadas que no existen" }, { status: 404 });
  const originByCard = new Map(cards.map((card) => [card.id, card.dispatchOrigin]));
  if (cards.some((card) => !card.dispatchOrigin)) return NextResponse.json({ error: "Todas las tarjetas deben tener procedencia antes de generar una redaccion" }, { status: 409 });

  const targetDate = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date();
  const redactions = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const [tipo, entries, appliedStatus] of [[RedactionType.ENTREGA, entregadas, CardStatus.ENTREGADA], [RedactionType.RETORNO, retornadas, CardStatus.RETORNADA]] as const) {
      const byOrigin = new Map<DispatchOrigin, Item[]>();
      for (const entry of entries) {
        const origin = originByCard.get(entry.cardId) as DispatchOrigin;
        byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), entry]);
      }
      for (const [origin, originItems] of byOrigin) {
        created.push(await tx.redaction.create({
          data: { tipo, dispatchOrigin: origin, zona: parsed.data.zona, fecha: targetDate, notas: parsed.data.comentario, items: { create: originItems.map((entry, index) => ({ cardId: entry.cardId, isRemote: entry.isRemote ?? null, comentario: entry.comentario ?? parsed.data.comentario, appliedStatus, sequence: index + 1 })) } },
          include: { items: { include: { card: { include: { customer: true } } } } },
        }));
      }
    }
    await tx.auditLog.create({ data: { entity: "REDACTION", entityId: "bulk", action: "GENERATE", userId: auth.session.user.id, details: { zona: parsed.data.zona, fecha: targetDate.toISOString(), entregadas: entregadas.length, retornadas: retornadas.length, partitions: created.length } } });
    return created;
  });
  return NextResponse.json({ redactions, totalItems: all.length }, { status: 201 });
}
