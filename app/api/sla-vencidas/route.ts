import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { remainingBusinessDays } from "@/lib/sla";
import { prisma } from "@/lib/prisma";
import { buildListEnvelope, ListQueryValidationError } from "@/lib/list-query";
import { CALL_ASSIGNMENT_SELECT, toAsignadoA } from "@/lib/call-assignment";
import { compileSlaVencidasQuery, readSlaOperativo } from "./shared";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const messengerId = request.nextUrl.searchParams.get("messengerId");

  let compiled;
  try {
    compiled = await compileSlaVencidasQuery(request.nextUrl.searchParams, auth.session.user.id);
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const { where: finalWhere, orderBy, skip, take, page, pageSize, unpaginated, today } = compiled;

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
        // This route uses an explicit `select`, so group membership has to be
        // named here. Bare ids only — clients resolve id -> name through
        // `lib/use-card-groups.ts`. Same shape as `app/api/urgentes/route.ts`.
        groupMemberships: { select: { groupId: true } },
        callAssignment: CALL_ASSIGNMENT_SELECT,
        _count: { select: { contacts: true } },
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
    const { op, contactado, solicitudRetorno, traslado, contactoEstado } = readSlaOperativo(card.metadata);
    const canalContacto = typeof op.canalContacto === "string" ? op.canalContacto : null;
    const nuevaDireccion = typeof op.nuevaDireccion === "string" ? op.nuevaDireccion : null;
    const fechaPreferenciaEntrega = typeof op.fechaPreferenciaEntrega === "string" ? op.fechaPreferenciaEntrega : null;
    const motivoRetorno = typeof op.motivoRetorno === "string" ? op.motivoRetorno : null;
    const comentarioContacto = typeof op.comentarioContacto === "string" ? op.comentarioContacto : null;

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
      asignadoA: toAsignadoA(card.callAssignment),
      attempts: card._count.contacts,
      metadata: card.metadata,
      groupIds: card.groupMemberships.map((membership) => membership.groupId),
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
