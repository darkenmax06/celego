import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { MobileAssignmentsResponseSchema } from "@/packages/contracts/src";
import {
  serializeMobileAssignmentCard,
  type CardForMobileAssignment,
} from "@/lib/mobile-assignments";
import { MOBILE_OPEN_CARD_STATUSES } from "@/lib/mobile-authorization";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

function parsePagination(request: NextRequest) {
  const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(request.nextUrl.searchParams.get("pageSize") ?? "100");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(200, Math.max(1, Math.trunc(pageSizeRaw)))
    : 100;
  return { page, pageSize };
}

export async function GET(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const deviceId = request.nextUrl.searchParams.get("deviceId")?.trim();
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId requerido" }, { status: 400 });
  }

  const requestedMessengerId = request.nextUrl.searchParams.get("messengerId")?.trim();
  const sessionMessengerId = auth.session.user.messengerId;
  const role = auth.session.user.role;
  const targetMessengerId =
    role === UserRole.MENSAJERO ? sessionMessengerId : requestedMessengerId ?? sessionMessengerId;

  if (!targetMessengerId) {
    return NextResponse.json({ error: "messengerId requerido" }, { status: 400 });
  }

  const device = await prisma.mobileDevice.findUnique({
    where: { deviceId },
    select: { id: true, deviceId: true, messengerId: true, status: true },
  });

  if (!device) {
    return NextResponse.json({ error: "Dispositivo no registrado" }, { status: 403 });
  }
  if (device.status !== "ACTIVE") {
    return NextResponse.json({ error: "Dispositivo no activo" }, { status: 403 });
  }
  if (device.messengerId !== targetMessengerId) {
    return NextResponse.json({ error: "Dispositivo no asignado al mensajero" }, { status: 403 });
  }

  const { page, pageSize } = parsePagination(request);
  const where = {
    currentMessengerId: targetMessengerId,
    status: { in: [...MOBILE_OPEN_CARD_STATUSES] },
  };

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        customer: {
          select: {
            cedula: true,
            nombre: true,
            direccionRaw: true,
          },
        },
        routeItems: {
          where: {
            route: {
              messengerId: targetMessengerId,
            },
          },
          include: {
            route: {
              select: {
                id: true,
                fecha: true,
                createdAt: true,
                messengerId: true,
              },
            },
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
  const payload = {
    deviceId: device.deviceId,
    messengerId: targetMessengerId,
    generatedAt: new Date().toISOString(),
    page,
    pageSize,
    total,
    totalPages,
    assignments: cards.map((card) =>
      serializeMobileAssignmentCard(card as CardForMobileAssignment),
    ),
  };

  const parsed = MobileAssignmentsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Asignaciones moviles invalidas", issues: parsed.error.issues },
      { status: 500 },
    );
  }

  await prisma.mobileDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  return NextResponse.json(parsed.data);
}
