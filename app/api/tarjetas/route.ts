import { NextRequest, NextResponse } from "next/server";
import { CardProductType, CardStatus } from "@prisma/client";
import { parseISO } from "date-fns";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { recalculateAdditionalCardsForGroups } from "@/lib/card-additional";
import { toCardStatus } from "@/lib/card-status";
import { applyCardTransition, RETURN_REASON_REQUIRED } from "@/lib/card-transition";

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

const createSchema = z.object({
  productType: z.nativeEnum(CardProductType).default(CardProductType.CREDITO),
  tc: z.string().trim().optional(),
  requestNumber: z.string().trim().regex(/^4-\d{11}$/).optional(),
  cedula: z.string().trim().min(1),
  nombre: z.string().trim().min(1),
  provincia: z.string().trim().optional(),
  zona: z.string().trim().optional(),
  isRemote: z.boolean().optional(),
  dispatchDate: z.coerce.date().optional(),
}).superRefine((value, ctx) => {
  if (value.productType === CardProductType.CREDITO && !value.tc) {
    ctx.addIssue({ code: "custom", path: ["tc"], message: "El n\u00famero de tarjeta es requerido" });
  }
  if (value.productType === CardProductType.DEBITO && !value.requestNumber) {
    ctx.addIssue({ code: "custom", path: ["requestNumber"], message: "El n\u00famero de solicitud es requerido" });
  }
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
  const productType = searchParams.get("productType");
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
      { requestNumber: { contains: q, mode: "insensitive" } },
      { externalReference: { contains: q, mode: "insensitive" } },
      { customer: { cedula: { contains: q, mode: "insensitive" } } },
      { customer: { nombre: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (status && status !== "ALL") where.status = toCardStatus(status);
  if (productType && productType !== "ALL") where.productType = productType;
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
        lastAssignedMessenger: true,
        urgentCases: {
          where: { resolvedAt: null },
          orderBy: [{ level: "desc" }, { importedAt: "desc" }],
          take: 1,
          select: {
            id: true,
            level: true,
            nextNotificationAt: true,
            lastNotifiedAt: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.card.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedCards = cards.map(({ urgentCases, ...card }) => ({
    ...card,
    activeUrgentCase: urgentCases[0] ?? null,
  }));

  return NextResponse.json({
    cards: normalizedCards,
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

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await applyCardTransition({
        tx,
        card,
        nextStatus,
        byUserId: auth.session.user.id,
        note: parsed.data.note,
        returnReason: nextReturnReason,
        data: {
          provincia: parsed.data.provincia ?? undefined,
          zona: parsed.data.zona ?? undefined,
          isRemote: parsed.data.isRemote ?? undefined,
          currentMessengerId:
            parsed.data.messengerId === undefined ? undefined : parsed.data.messengerId,
          lastAssignedMessengerId:
            parsed.data.messengerId === undefined || parsed.data.messengerId === null
              ? undefined
              : parsed.data.messengerId,
        },
      });

      return tx.card.findUniqueOrThrow({
        where: { id: card.id },
        include: { customer: true, currentMessenger: true, lastAssignedMessenger: true },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === RETURN_REASON_REQUIRED) {
      return NextResponse.json(
        { error: "Motivo de devolucion requerido para marcar tarjeta retornada/devuelta" },
        { status: 400 },
      );
    }
    throw error;
  }

  return NextResponse.json({ card: updated });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de tarjeta inv\u00e1lidos" }, { status: 400 });
  }
  const { productType, tc, requestNumber, cedula, nombre, provincia, zona, isRemote, dispatchDate } = parsed.data;

  const customer = await prisma.customer.upsert({
    where: { cedula },
    update: { nombre, provincia: provincia ?? undefined, zona: zona ?? undefined },
    create: { cedula, nombre, provincia: provincia ?? null, zona: zona ?? null },
  });

  const card = await prisma.card.create({
    data: {
      tc: productType === CardProductType.CREDITO ? tc! : "",
      requestNumber: productType === CardProductType.DEBITO ? requestNumber : null,
      productType,
      customerId: customer.id,
      provincia: provincia ?? "Santo Domingo",
      zona: zona ?? "Metro",
      isRemote: Boolean(isRemote),
      status: CardStatus.DESPACHADA,
      dispatchDate: dispatchDate ?? new Date(),
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

  await recalculateAdditionalCardsForGroups([
    {
      customerCedula: cedula,
      dispatchDate: card.dispatchDate,
    },
  ]);

  return NextResponse.json({ card }, { status: 201 });
}
