import { NextRequest, NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { remainingBusinessDays } from "@/lib/sla";
import { prisma } from "@/lib/prisma";

const CLOSED_STATUSES: CardStatus[] = [
  CardStatus.ENTREGADA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.RETORNADA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
];

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const where = {
    status: { notIn: CLOSED_STATUSES },
    slaDueDate: { lt: today },
    ...(messengerId && messengerId !== "ALL" ? { currentMessengerId: messengerId } : {}),
  };

  const [cards, messengers] = await Promise.all([
    prisma.card.findMany({
      where,
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
      orderBy: [{ slaDueDate: "asc" }, { updatedAt: "desc" }],
      take: 5000,
    }),
    prisma.messenger.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const rows = cards.map((card) => ({
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
  }));

  return NextResponse.json({
    filters: {
      messengerId: messengerId && messengerId !== "ALL" ? messengerId : "ALL",
    },
    messengers,
    total: rows.length,
    rows,
  });
}
