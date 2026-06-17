import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      customer: true,
      currentMessenger: true,
      reassignedMessenger: true,
      deliveryReassignments: {
        include: {
          byUser: true,
          fromMessenger: true,
          toMessenger: true,
        },
        orderBy: { createdAt: "desc" },
        take: 120,
      },
      logs: {
        include: { byUser: true },
        orderBy: { createdAt: "desc" },
        take: 120,
      },
      contacts: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 120,
      },
      urgentCases: {
        where: { resolvedAt: null },
        orderBy: [{ level: "desc" }, { importedAt: "desc" }],
        take: 1,
      },
    },
  });

  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }

  const routeIds = [
    ...new Set(
      card.logs
        .map((log) => {
          const match = log.note?.match(/ruta\s+([a-z0-9]+)/i);
          return match?.[1] ?? null;
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const routes = routeIds.length
    ? await prisma.route.findMany({
        where: { id: { in: routeIds } },
        include: { messenger: true },
      })
    : [];
  const routeById = new Map(routes.map((route) => [route.id, route]));

  const enrichedLogs = card.logs.map((log) => {
    const match = log.note?.match(/ruta\s+([a-z0-9]+)/i);
    if (!match) return log;

    const route = routeById.get(match[1]);
    if (!route?.messenger?.nombre) return log;

    const messengerName = route.messenger.nombre;
    return {
      ...log,
      note:
        log.note?.replace(
          /ruta\s+([a-z0-9]+)/gi,
          (_raw, routeId: string) => `ruta ${routeId} · mensajero ${messengerName}`,
        ) ?? log.note,
    };
  });

  return NextResponse.json({
    card: {
      ...card,
      logs: enrichedLogs,
      activeUrgentCase: card.urgentCases[0] ?? null,
    },
  });
}
