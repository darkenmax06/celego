import { NextRequest, NextResponse } from "next/server";
import {
  MobileDeviceStatus,
  MobileIncidentSeverity,
  MobileIncidentStatus,
  MobileSyncJobKind,
  MobileSyncJobStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import {
  findPiiViolation,
  ReportMobileIncidentSchema,
} from "@/packages/contracts/src";
import { canAccessMobileAssignedCard } from "@/lib/mobile-authorization";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

function serializeIncident(row: {
  id: string;
  incidentId: string;
  severity: MobileIncidentSeverity;
  status: MobileIncidentStatus;
  type: string;
  title: string;
  description: string | null;
  deviceId: string;
  routeItemId: string | null;
  evidenceObjectId: string | null;
  reportedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    incidentId: row.incidentId,
    severity: row.severity,
    status: row.status,
    type: row.type,
    title: row.title,
    description: row.description,
    deviceId: row.deviceId,
    routeItemId: row.routeItemId,
    evidenceObjectId: row.evidenceObjectId,
    reportedAt: row.reportedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const role = auth.session.user.role;
  const statusParam = request.nextUrl.searchParams.get("status");
  const deviceId = request.nextUrl.searchParams.get("deviceId")?.trim();
  const where: Prisma.MobileIncidentWhereInput = {};

  if (role === UserRole.MENSAJERO) {
    if (!auth.session.user.messengerId) {
      return NextResponse.json({ error: "Mensajero requerido" }, { status: 400 });
    }
    where.messengerId = auth.session.user.messengerId;
  }
  if (statusParam && statusParam in MobileIncidentStatus) {
    where.status = statusParam as MobileIncidentStatus;
  }
  if (deviceId) where.deviceId = deviceId;

  const incidents = await prisma.mobileIncident.findMany({
    where,
    orderBy: [{ reportedAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ incidents: incidents.map(serializeIncident) });
}

export async function POST(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const raw = await request.json();
  const piiViolation = findPiiViolation(raw);
  if (piiViolation) {
    return NextResponse.json(
      {
        error: "Incidencia contiene PII no permitida",
        path: piiViolation.path,
        reason: piiViolation.reason,
      },
      { status: 400 },
    );
  }

  const parsed = ReportMobileIncidentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [device, item, cardById] = await Promise.all([
    prisma.mobileDevice.findUnique({
      where: { deviceId: parsed.data.deviceId },
      select: {
        id: true,
        deviceId: true,
        messengerId: true,
        status: true,
      },
    }),
    parsed.data.routeItemId
      ? prisma.routeItem.findUnique({
          where: { id: parsed.data.routeItemId },
          include: { route: true, card: true },
        })
      : Promise.resolve(null),
    parsed.data.cardId
      ? prisma.card.findUnique({
          where: { id: parsed.data.cardId },
        })
      : Promise.resolve(null),
  ]);

  if (!device) {
    return NextResponse.json({ error: "Dispositivo no registrado" }, { status: 403 });
  }
  if (device.status !== MobileDeviceStatus.ACTIVE) {
    return NextResponse.json({ error: "Dispositivo no activo" }, { status: 403 });
  }

  const card = cardById ?? item?.card ?? null;
  if (parsed.data.routeItemId && !item) {
    return NextResponse.json({ error: "Item de ruta no encontrado" }, { status: 404 });
  }
  if (parsed.data.cardId && !cardById) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }
  if (parsed.data.cardId && item && item.cardId !== parsed.data.cardId) {
    return NextResponse.json(
      { error: "routeItemId no corresponde a cardId" },
      { status: 400 },
    );
  }
  if (item && item.route.messengerId !== item.card.currentMessengerId) {
    return NextResponse.json(
      { error: "Item de ruta no corresponde al mensajero actual de la tarjeta" },
      { status: 403 },
    );
  }

  if (card) {
    const access = canAccessMobileAssignedCard({
      role: auth.session.user.role,
      sessionMessengerId: auth.session.user.messengerId,
      cardMessengerId: card.currentMessengerId,
      deviceMessengerId: device.messengerId,
      deviceStatus: device.status,
      cardStatus: card.status,
    });
    if (!access.allowed) {
      return NextResponse.json({ error: "No autorizado", reason: access.reason }, { status: 403 });
    }
  } else if (
    auth.session.user.role === UserRole.MENSAJERO &&
    auth.session.user.messengerId !== device.messengerId
  ) {
    return NextResponse.json({ error: "Dispositivo no asignado al mensajero" }, { status: 403 });
  }

  const incidentMessengerId = card?.currentMessengerId ?? device.messengerId;

  const incident = await prisma.$transaction(async (tx) => {
    const row = await tx.mobileIncident.upsert({
      where: { incidentId: parsed.data.incidentId },
      update: {
        severity: parsed.data.severity,
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description,
        gps: parsed.data.gps as unknown as Prisma.InputJsonValue,
        metadata: parsed.data.technicalMetadata as unknown as Prisma.InputJsonValue,
        reportedAt: new Date(parsed.data.reportedAt),
      },
      create: {
        incidentId: parsed.data.incidentId,
        severity: parsed.data.severity,
        status: MobileIncidentStatus.OPEN,
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description,
        deviceId: parsed.data.deviceId,
        mobileDeviceId: device.id,
        messengerId: incidentMessengerId,
        routeId: item?.routeId ?? parsed.data.routeId ?? null,
        routeItemId: item?.id ?? null,
        cardId: card?.id ?? null,
        evidenceObjectId: parsed.data.evidenceObjectId,
        gps: parsed.data.gps as unknown as Prisma.InputJsonValue,
        metadata: parsed.data.technicalMetadata as unknown as Prisma.InputJsonValue,
        reportedAt: new Date(parsed.data.reportedAt),
        createdByUserId: auth.session.user.id,
      },
    });

    await tx.mobileSyncJob.create({
      data: {
        kind: MobileSyncJobKind.INCIDENT_REPORT,
        status: MobileSyncJobStatus.SUCCEEDED,
        deviceId: parsed.data.deviceId,
        mobileDeviceId: device.id,
        messengerId: row.messengerId,
        routeId: row.routeId,
        routeItemId: row.routeItemId,
        incidentId: row.id,
        objectId: row.incidentId,
        attempts: 1,
        completedAt: new Date(),
        payload: {
          type: row.type,
          severity: row.severity,
          status: row.status,
        },
      },
    });

    await tx.mobileDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    return row;
  });

  return NextResponse.json({ incident: serializeIncident(incident) }, { status: 201 });
}
