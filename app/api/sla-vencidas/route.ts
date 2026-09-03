import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { remainingBusinessDays } from "@/lib/sla";
import { prisma } from "@/lib/prisma";
import { buildListEnvelope, compile, ListQueryValidationError } from "@/lib/list-query";
import {
  slaVencidasListQuery,
  SLA_CLOSED_STATUSES,
} from "@/lib/list-query/descriptors/sla-vencidas";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const baseConstraint = {
    status: { notIn: [...SLA_CLOSED_STATUSES] },
    slaDueDate: { lt: today },
  };

  let compiled;
  try {
    compiled = compile(slaVencidasListQuery, request.nextUrl.searchParams, {
      andPrefix: [baseConstraint],
    });
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

  const { where, orderBy, skip, take, page, pageSize, unpaginated } = compiled;
  const finalWhere: Prisma.CardWhereInput = contactoConstraint
    ? { AND: [where, contactoConstraint] }
    : where;

  const [cards, messengers, total] = await Promise.all([
    prisma.card.findMany({
      where: finalWhere,
      select: {
        id: true,
        tc: true,
        status: true,
        slaDueDate: true,
        dispatchDate: true,
        provincia: true,
        zona: true,
        isAdditional: true,
        additionalIndex: true,
        metadata: true,
        customer: {
          select: {
            nombre: true,
            cedula: true,
            direccionRaw: true,
            telefonosRaw: true,
          },
        },
        currentMessenger: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.messenger.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.card.count({ where: finalWhere }),
  ]);

  const rows = cards.map((card) => {
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
      id: card.id,
      tc: card.tc,
      status: card.status,
      slaDueDate: card.slaDueDate?.toISOString() ?? null,
      dispatchDate: card.dispatchDate?.toISOString() ?? null,
      provincia: card.provincia,
      zona: card.zona,
      tipoTarjeta: card.isAdditional ? "ADICIONAL" : "PRINCIPAL",
      adicional: card.isAdditional,
      adicionalNumero: card.additionalIndex,
      nombre: card.customer.nombre,
      cedula: card.customer.cedula,
      direccion: card.customer.direccionRaw ?? "",
      telefonos: card.customer.telefonosRaw ?? "",
      mensajero: card.currentMessenger?.nombre ?? "",
      mensajeroId: card.currentMessenger?.id ?? "",
      diasVencidos: Math.abs(Math.min(0, remainingBusinessDays(new Date(), card.slaDueDate ?? today))),
      contactado,
      contactoEstado,
      canalContacto,
      nuevaDireccion,
      fechaPreferenciaEntrega,
      solicitudRetorno,
      motivoRetorno,
      traslado,
      comentarioContacto,
      metadata: card.metadata,
    };
  });

  return NextResponse.json({
    filters: {
      messengerId: messengerId && messengerId !== "ALL" ? messengerId : "ALL",
    },
    messengers,
    total,
    rows,
    pagination: buildListEnvelope({
      page,
      pageSize: unpaginated ? total : pageSize,
      total,
    }),
  });
}
