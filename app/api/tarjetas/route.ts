import { NextRequest, NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { parseISO } from "date-fns";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { toCardStatus } from "@/lib/card-status";

const updateSchema = z.object({
  id: z.string().cuid(),
  status: z.string().optional(),
  provincia: z.string().optional(),
  zona: z.string().optional(),
  isRemote: z.boolean().optional(),
  messengerId: z.string().cuid().nullable().optional(),
  returnReason: z.string().nullable().optional(),
  note: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status");
  const provincia = searchParams.get("provincia");
  const zona = searchParams.get("zona");
  const urgent = searchParams.get("urgent");
  const remote = searchParams.get("remote");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "25");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(200, Math.max(1, Math.trunc(pageSizeRaw))) : 25;

  const where: Record<string, unknown> = {};

  if (q) {
    where.OR = [
      { tc: { contains: q, mode: "insensitive" } },
      { externalReference: { contains: q, mode: "insensitive" } },
      { customer: { cedula: { contains: q, mode: "insensitive" } } },
      { customer: { nombre: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (status && status !== "ALL") where.status = toCardStatus(status);
  if (provincia && provincia !== "ALL") where.provincia = provincia;
  if (zona && zona !== "ALL") where.zona = zona;
  if (urgent === "1") where.urgent = true;
  if (remote === "1") where.isRemote = true;
  if (remote === "0") where.isRemote = false;
  if (from || to) {
    where.dispatchDate = {
      ...(from ? { gte: parseISO(from) } : {}),
      ...(to ? { lte: parseISO(to) } : {}),
    };
  }

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        customer: true,
        currentMessenger: true,
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.card.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return NextResponse.json({
    cards,
    pagination: { page, pageSize, total, totalPages },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({ where: { id: parsed.data.id } });
  if (!card) return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });

  const nextStatus = parsed.data.status
    ? toCardStatus(parsed.data.status, card.status)
    : card.status;
  const requiresReturnReason =
    nextStatus === CardStatus.RETORNADA || nextStatus === CardStatus.DEVUELTA_TIENDA;
  const nextReturnReason =
    parsed.data.returnReason !== undefined
      ? parsed.data.returnReason
      : requiresReturnReason
        ? card.returnReason
        : null;

  if (requiresReturnReason && !nextReturnReason?.trim()) {
    return NextResponse.json(
      { error: "Motivo de devolucion requerido para marcar tarjeta retornada/devuelta" },
      { status: 400 },
    );
  }

  const updated = await prisma.card.update({
    where: { id: card.id },
    data: {
      status: nextStatus,
      provincia: parsed.data.provincia ?? undefined,
      zona: parsed.data.zona ?? undefined,
      isRemote: parsed.data.isRemote ?? undefined,
      currentMessengerId:
        parsed.data.messengerId === undefined ? undefined : parsed.data.messengerId,
      returnReason: nextReturnReason,
    },
    include: { customer: true, currentMessenger: true },
  });

  if (card.status !== nextStatus || parsed.data.note) {
    await prisma.cardStatusLog.create({
      data: {
        cardId: card.id,
        fromStatus: card.status,
        toStatus: nextStatus,
        note: parsed.data.note,
        byUserId: auth.session.user.id,
      },
    });
  }

  return NextResponse.json({ card: updated });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { tc, cedula, nombre, provincia, zona, isRemote } = body ?? {};
  if (!tc || !cedula || !nombre) {
    return NextResponse.json({ error: "tc, cedula y nombre son requeridos" }, { status: 400 });
  }

  const customer = await prisma.customer.upsert({
    where: { cedula },
    update: { nombre, provincia: provincia ?? undefined, zona: zona ?? undefined },
    create: { cedula, nombre, provincia: provincia ?? null, zona: zona ?? null },
  });

  const card = await prisma.card.create({
    data: {
      tc,
      customerId: customer.id,
      provincia: provincia ?? "Santo Domingo",
      zona: zona ?? "Metro",
      isRemote: Boolean(isRemote),
      status: CardStatus.DESPACHADA,
      dispatchDate: new Date(),
    },
    include: { customer: true },
  });

  await prisma.cardStatusLog.create({
    data: {
      cardId: card.id,
      toStatus: CardStatus.DESPACHADA,
      note: "Creacion manual",
      byUserId: auth.session.user.id,
    },
  });

  return NextResponse.json({ card }, { status: 201 });
}
