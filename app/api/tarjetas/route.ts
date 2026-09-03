import { NextRequest, NextResponse } from "next/server";
import { CardProductType, CardStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { recalculateAdditionalCardsForGroups } from "@/lib/card-additional";
import { toCardStatus } from "@/lib/card-status";
import { buildListEnvelope, compile, ListQueryValidationError } from "@/lib/list-query";
import { tarjetasListQuery } from "@/lib/list-query/descriptors/tarjetas";
import { applyCardTransition, RETURN_REASON_REQUIRED } from "@/lib/card-transition";

const originSchema = z.enum(["TORRE_POPULAR", "CENTRO_ACOPIO"]);

const updateSchema = z.object({
  id: z.string().cuid(),
  status: z.string().optional(),
  provincia: z.string().optional(),
  zona: z.string().optional(),
  isRemote: z.boolean().optional(),
  messengerId: z.string().cuid().nullable().optional(),
  returnReason: z.string().nullable().optional(),
  note: z.string().optional(),
  // SDD contrato-tarjetas-pistoleo (spec: hasContract editable after
  // assignment). Toggling this alone never resolves an exception status
  // (ENTREGA_DIGITAL_SIN_CONTRATO / ENTREGA_SIN_CONTRATO); only the two
  // dedicated resolution actions do that.
  hasContract: z.boolean().optional(),
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
  origin: originSchema.optional().default("TORRE_POPULAR"),
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

  // Task 10.1: the whole filter/pagination surface now comes from the shared
  // descriptor. Its `status` coercion and `boundaries: "instant"` date bounds
  // reproduce this route's historical behaviour exactly — see the descriptor.
  let query;
  try {
    query = compile(tarjetasListQuery, request.nextUrl.searchParams);
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const contactoEstadoParam = request.nextUrl.searchParams.get("contactoEstado");

  let contactoConstraint: Prisma.CardWhereInput | undefined;
  if (contactoEstadoParam && contactoEstadoParam !== "ALL") {
    if (contactoEstadoParam === "CONTACTADA") {
      contactoConstraint = {
        metadata: { path: ["operativo", "contactado"], equals: true },
      };
    } else if (contactoEstadoParam === "RETORNO_SOLICITADO") {
      contactoConstraint = {
        metadata: { path: ["operativo", "solicitudRetorno"], equals: true },
      };
    } else if (contactoEstadoParam === "TRASLADO_SOLICITADO") {
      contactoConstraint = {
        metadata: { path: ["operativo", "traslado", "provinciaDestino"], not: Prisma.AnyNull },
      };
    } else if (contactoEstadoParam === "NO_CONTACTADA") {
      contactoConstraint = {
        NOT: { metadata: { path: ["operativo", "contactado"], equals: true } },
      };
    }
  }

  const { where } = query;
  const finalWhere: Prisma.CardWhereInput = contactoConstraint
    ? { AND: [where, contactoConstraint] }
    : where;

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where: finalWhere,
      include: {
        customer: true,
        currentMessenger: true,
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
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    }),
    prisma.card.count({ where: finalWhere }),
  ]);

  const normalizedCards = cards.map(({ urgentCases, ...card }) => {
    const root = (card.metadata && typeof card.metadata === "object" ? card.metadata : {}) as Record<string, unknown>;
    const op = (root.operativo && typeof root.operativo === "object" ? root.operativo : {}) as Record<string, unknown>;
    const contactado = Boolean(op.contactado);
    const solicitudRetorno = Boolean(op.solicitudRetorno);
    const traslado = op.traslado && typeof op.traslado === "object" ? (op.traslado as Record<string, unknown>) : null;
    const canalContacto = typeof op.canalContacto === "string" ? op.canalContacto : null;
    const nuevaDireccion = typeof op.nuevaDireccion === "string" ? op.nuevaDireccion : null;
    const fechaPreferenciaEntrega = typeof op.fechaPreferenciaEntrega === "string" ? op.fechaPreferenciaEntrega : null;
    const motivoRetorno = typeof op.motivoRetorno === "string" ? op.motivoRetorno : null;
    const comentarioContacto = typeof op.comentarioContacto === "string" ? op.comentarioContacto : null;
    const contactoEstado = solicitudRetorno
      ? "RETORNO_SOLICITADO"
      : traslado && Object.keys(traslado).length > 0
        ? "TRASLADO_SOLICITADO"
        : contactado
          ? "CONTACTADA"
          : "NO_CONTACTADA";

    return {
      ...card,
      contactado,
      contactoEstado,
      canalContacto,
      nuevaDireccion,
      fechaPreferenciaEntrega,
      solicitudRetorno,
      motivoRetorno,
      traslado,
      comentarioContacto,
      activeUrgentCase: urgentCases[0] ?? null,
    };
  });

  return NextResponse.json({
    cards: normalizedCards,
    pagination: buildListEnvelope({ page: query.page, pageSize: query.pageSize, total }),
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
          hasContract: parsed.data.hasContract ?? undefined,
          metadata: {
            ...((card.metadata as Record<string, unknown>) || {}),
            ...(parsed.data.note ? { comment: parsed.data.note, COMENTARIO: parsed.data.note } : {}),
          },
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
