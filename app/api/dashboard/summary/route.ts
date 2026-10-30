import { NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { remainingBusinessDays } from "@/lib/sla";
import { loadDailyFlow } from "@/lib/dashboard/daily-flow";
import { buildZoneBreakdown, parseDashboardProductType, productTypeWhere } from "@/lib/dashboard/filters";
import {
  DELIVERED_STATUSES,
  EN_ROUTE_STATUSES,
  IN_POSSESSION_STATUSES,
  RETURNED_STATUSES,
  sumStatuses,
} from "@/lib/dashboard/status-segments";
import { SLA_CLOSED_STATUSES } from "@/lib/list-query/descriptors/sla-vencidas";
import {
  clampUrgencyLevel,
  emitDueUrgentNotifications,
  urgencyIntervalMinutes,
  urgencyLevelLabel,
} from "@/lib/urgent-alerts";

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

  await emitDueUrgentNotifications({
    byUserId: auth.session.user.id,
    limit: 20,
  });

  const url = new URL(request.url);
  const { start, end } = parseDateRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );

  const productType = parseDashboardProductType(url.searchParams.get("productType"));
  const productFilter = productTypeWhere(productType);
  const dispatchRange = { gte: start, lte: end };
  const rangeWhere = { dispatchDate: dispatchRange, ...productFilter };
  // Urgent cases are not range-bound; only the product filter narrows them.
  const urgentCardFilter = productType === "ALL" ? {} : { card: productFilter };

  const [statusGroups, zoneGroups, activeUrgentCasesRaw, urgentTotal, recentLogs, cardsWithSla, contactedCards, dailyFlow] = await Promise.all([
    prisma.card.groupBy({
      where: rangeWhere,
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.card.groupBy({
      where: rangeWhere,
      by: ["zona"],
      _count: { _all: true },
    }),
    prisma.urgentCase.findMany({
      where: {
        resolvedAt: null,
        cardId: { not: null },
        ...urgentCardFilter,
      },
      include: {
        card: {
          include: { customer: true },
        },
      },
      orderBy: [{ level: "desc" }, { nextNotificationAt: "asc" }, { importedAt: "desc" }],
      take: 20,
    }),
    prisma.urgentCase.count({
      where: {
        resolvedAt: null,
        ...urgentCardFilter,
      },
    }),
    prisma.cardStatusLog.findMany({
      where: {
        card: rangeWhere,
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
          notIn: [...SLA_CLOSED_STATUSES],
        },
        slaDueDate: { not: null },
        ...rangeWhere,
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
        status: { notIn: [CardStatus.ENTREGADA, CardStatus.TD_ENTREGADO] },
        metadata: { path: ["operativo", "contactado"], equals: true },
        ...rangeWhere,
      },
      select: {
        id: true,
        tc: true,
        status: true,
        provincia: true,
        zona: true,
        customer: {
          select: { nombre: true, cedula: true },
        },
      },
      take: 12,
      orderBy: { updatedAt: "desc" },
    }),
    loadDailyFlow({ fromKey: dateKey(start), toKey: dateKey(end), productType }),
  ]);

  const statusMap = Object.fromEntries(
    statusGroups.map((entry) => [entry.status, entry._count._all]),
  );
  const statusBreakdown = Object.values(CardStatus).map((status) => ({
    status,
    count: statusMap[status] ?? 0,
  }));

  const seenCards = new Set<string>();
  const activeUrgentCases = activeUrgentCasesRaw
    .filter((item) => item.card?.id && !seenCards.has(item.card.id))
    .map((item) => {
      if (item.card?.id) {
        seenCards.add(item.card.id);
      }
      const level = clampUrgencyLevel(item.level);
      return {
        id: item.id,
        cardId: item.card!.id,
        tc: item.card!.tc,
        provincia: item.card!.provincia,
        status: item.card!.status,
        customer: {
          nombre: item.card!.customer.nombre,
          cedula: item.card!.customer.cedula,
        },
        level,
        levelLabel: urgencyLevelLabel(level),
        intervalMinutes: urgencyIntervalMinutes(level),
        nextNotificationAt: item.nextNotificationAt?.toISOString() ?? null,
        lastNotifiedAt: item.lastNotifiedAt?.toISOString() ?? null,
      };
    })
    .slice(0, 12);

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

  const zoneBreakdown = buildZoneBreakdown(
    zoneGroups.map((entry) => ({ zona: entry.zona, count: entry._count._all })),
  );

  const contactadasPendientes = contactedCards.map((card) => ({
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
    productType,
    statusBreakdown,
    metrics: {
      enPosesion: sumStatuses(statusMap, IN_POSSESSION_STATUSES),
      enRuta: sumStatuses(statusMap, EN_ROUTE_STATUSES),
      entregadas: sumStatuses(statusMap, DELIVERED_STATUSES),
      urgentes: urgentTotal,
      retornadas: sumStatuses(statusMap, RETURNED_STATUSES),
    },
    urgentes: activeUrgentCases,
    slaAlerts,
    zoneBreakdown,
    recentActivity: recentLogs.map((log) => ({
      ...log,
      card: {
        id: log.card.id,
        tc: log.card.tc,
        customer: log.card.customer,
      },
    })),
    contactadasPendientes,
    dailyFlow,
  });
}
