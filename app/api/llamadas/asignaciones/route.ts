import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { buildListEnvelope } from "@/lib/list-query";
import { CALL_ASSIGNMENT_SELECT } from "@/lib/call-assignment";
import { mapCardToOperativeRow } from "@/lib/operativo-row";

const MAX_CARDS = 1000;

const assignSchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(MAX_CARDS),
  assignedToId: z.string().min(1),
});

const unassignSchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(MAX_CARDS),
});

function parsePositiveInt(raw: string | null, fallback: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(max, Math.trunc(value));
}

/**
 * GET /api/llamadas/asignaciones?mine=1&assignedToId=&q=&page=&pageSize=
 * Cards with a call assignment (optionally only the session user's), using the
 * operativo row shape plus `asignadoA`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const params = request.nextUrl.searchParams;
  const mine = params.get("mine") === "1" || params.get("mine") === "true";
  const assignedToParam = params.get("assignedToId")?.trim();
  const assignedToId = mine ? auth.session.user.id : assignedToParam || undefined;
  const q = params.get("q")?.trim();
  const page = parsePositiveInt(params.get("page"), 1, 100000);
  const pageSize = parsePositiveInt(params.get("pageSize"), 50, 200);

  const where: Prisma.CardWhereInput = {
    AND: [
      { callAssignment: assignedToId ? { is: { assignedToId } } : { isNot: null } },
      q
        ? {
            OR: [
              { tc: { contains: q, mode: "insensitive" } },
              { externalReference: { contains: q, mode: "insensitive" } },
              { customer: { cedula: { contains: q, mode: "insensitive" } } },
              { customer: { nombre: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        customer: true,
        currentMessenger: { select: { nombre: true, telefono: true } },
        callAssignment: CALL_ASSIGNMENT_SELECT,
        contacts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { comentario: true, contactado: true, telefonosUsados: true },
        },
      },
      orderBy: [{ urgent: "desc" }, { slaDueDate: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.card.count({ where }),
  ]);

  return NextResponse.json({
    cards: cards.map((card) => mapCardToOperativeRow(card)),
    pagination: buildListEnvelope({ page, pageSize, total }),
  });
}

/** POST { cardIds, assignedToId } -> upsert (reassign) one assignment per card. */
export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Payload inválido (máximo ${MAX_CARDS} tarjetas)` },
      { status: 400 },
    );
  }

  const assignee = await prisma.user.findFirst({
    where: { id: parsed.data.assignedToId, active: true, role: { in: ["ADMIN", "OPERADOR"] } },
    select: { id: true, name: true },
  });
  if (!assignee) {
    return NextResponse.json({ error: "Operador no válido" }, { status: 400 });
  }

  const requestedIds = [...new Set(parsed.data.cardIds)];
  const existingCards = await prisma.card.findMany({
    where: { id: { in: requestedIds } },
    select: { id: true, callAssignment: { select: { assignedToId: true } } },
  });

  const created = existingCards.filter((card) => !card.callAssignment).map((card) => card.id);
  const reassigned = existingCards
    .filter((card) => card.callAssignment && card.callAssignment.assignedToId !== assignee.id)
    .map((card) => card.id);
  const unchanged = existingCards.length - created.length - reassigned.length;

  await prisma.$transaction([
    prisma.callAssignment.createMany({
      data: created.map((cardId) => ({
        cardId,
        assignedToId: assignee.id,
        assignedById: auth.session.user.id,
      })),
      skipDuplicates: true,
    }),
    prisma.callAssignment.updateMany({
      where: { cardId: { in: reassigned } },
      data: { assignedToId: assignee.id, assignedById: auth.session.user.id },
    }),
  ]);

  return NextResponse.json({
    asignadoA: assignee,
    requested: requestedIds.length,
    assigned: created.length,
    reassigned: reassigned.length,
    unchanged,
    notFound: requestedIds.length - existingCards.length,
  });
}

/** DELETE { cardIds } -> removes the call assignment of those cards. */
export async function DELETE(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = unassignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Payload inválido (máximo ${MAX_CARDS} tarjetas)` },
      { status: 400 },
    );
  }

  const result = await prisma.callAssignment.deleteMany({
    where: { cardId: { in: [...new Set(parsed.data.cardIds)] } },
  });

  return NextResponse.json({ removed: result.count });
}
