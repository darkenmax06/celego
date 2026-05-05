import { NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { remainingBusinessDays } from "@/lib/sla";

function parseDateRange(fromRaw: string | null, toRaw: string | null) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const from = fromRaw ? new Date(fromRaw) : defaultFrom;
  const to = toRaw ? new Date(toRaw) : defaultTo;

  const safeFrom = Number.isNaN(from.getTime()) ? defaultFrom : from;
  const safeTo = Number.isNaN(to.getTime()) ? defaultTo : to;

  const start = new Date(safeFrom);
  start.setHours(0, 0, 0, 0);
  const end = new Date(safeTo);
  end.setHours(23, 59, 59, 999);

  if (start.getTime() <= end.getTime()) {
    return { start, end };
  }
  return { start: end, end: start };
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const { start, end } = parseDateRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );

  const dispatchRange = { gte: start, lte: end };

  const [statusGroups, urgentCards, recentLogs, cardsWithSla, nonDeliveredCards] = await Promise.all([
    prisma.card.groupBy({
      where: {
        dispatchDate: dispatchRange,
      },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.card.findMany({
      where: { urgent: true, dispatchDate: dispatchRange },
      include: { customer: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.cardStatusLog.findMany({
      where: {
        card: { dispatchDate: dispatchRange },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        card: { include: { customer: true } },
        byUser: true,
      },
    }),
    prisma.card.findMany({
      where: {
        status: {
          notIn: [
            CardStatus.ENTREGADA,
            CardStatus.RETORNADA,
            CardStatus.ENTREGA_DIGITAL,
            CardStatus.ACUSE_RECIBIDO,
            CardStatus.DEVUELTA_TIENDA,
          ],
        },
        slaDueDate: { not: null },
        dispatchDate: dispatchRange,
      },
      select: {
        id: true,
        tc: true,
        status: true,
        slaDueDate: true,
        customer: { select: { nombre: true, cedula: true } },
      },
    }),
    prisma.card.findMany({
      where: {
        status: { not: CardStatus.ENTREGADA },
        dispatchDate: dispatchRange,
      },
      select: {
        id: true,
        tc: true,
        status: true,
        provincia: true,
        zona: true,
        metadata: true,
        customer: {
          select: { nombre: true, cedula: true },
        },
      },
      take: 1200,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const statusMap = Object.fromEntries(
    statusGroups.map((entry) => [entry.status, entry._count._all]),
  );
  const statusBreakdown = Object.values(CardStatus).map((status) => ({
    status,
    count: statusMap[status] ?? 0,
  }));

  const slaAlerts = cardsWithSla
    .map((card) => {
      const remaining = card.slaDueDate ? remainingBusinessDays(new Date(), card.slaDueDate) : null;
      return {
        id: card.id,
        tc: card.tc,
        status: card.status,
        cliente: card.customer.nombre,
        cedula: card.customer.cedula,
        remaining,
      };
    })
    .filter((item) => item.remaining !== null && item.remaining <= 3)
    .sort((a, b) => (a.remaining ?? 99) - (b.remaining ?? 99))
    .slice(0, 10);

  const contactadasPendientes = nonDeliveredCards
    .filter((card) => {
      const root =
        card.metadata && typeof card.metadata === "object" && !Array.isArray(card.metadata)
          ? (card.metadata as Record<string, unknown>)
          : null;
      const operativo =
        root?.operativo &&
        typeof root.operativo === "object" &&
        !Array.isArray(root.operativo)
          ? (root.operativo as Record<string, unknown>)
          : null;
      return Boolean(operativo?.contactado);
    })
    .slice(0, 12)
    .map((card) => ({
      id: card.id,
      tc: card.tc,
      status: card.status,
      provincia: card.provincia,
      zona: card.zona,
      customer: card.customer,
    }));

  return NextResponse.json({
    range: {
      from: dateKey(start),
      to: dateKey(end),
    },
    statusBreakdown,
    metrics: {
      enPosesion:
        (statusMap.DESPACHADA ?? 0) +
        (statusMap.ENVIADA_INTERIOR ?? 0),
      enRuta: statusMap.EN_RUTA ?? 0,
      entregadas: (statusMap.ENTREGADA ?? 0) + (statusMap.ENTREGA_DIGITAL ?? 0),
      urgentes: urgentCards.length,
      retornadas: statusMap.RETORNADA ?? 0,
    },
    urgentes: urgentCards,
    slaAlerts,
    recentActivity: recentLogs.map((log) => ({
      ...log,
      card: {
        id: log.card.id,
        tc: log.card.tc,
        customer: log.card.customer,
      },
    })),
    contactadasPendientes,
  });
}
