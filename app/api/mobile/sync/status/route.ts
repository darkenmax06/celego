import { NextRequest, NextResponse } from "next/server";
import {
  MobileDeviceStatus,
  MobileSyncJobKind,
  MobileSyncJobStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { MobileSyncStatusRequestSchema } from "@/packages/contracts/src";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = MobileSyncStatusRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const device = await prisma.mobileDevice.findUnique({
    where: { deviceId: parsed.data.deviceId },
    select: { id: true, deviceId: true, messengerId: true, status: true },
  });
  if (!device) {
    return NextResponse.json({ error: "Dispositivo no registrado" }, { status: 403 });
  }
  if (device.status !== MobileDeviceStatus.ACTIVE) {
    return NextResponse.json({ error: "Dispositivo no activo" }, { status: 403 });
  }
  if (
    auth.session.user.role === UserRole.MENSAJERO &&
    auth.session.user.messengerId !== device.messengerId
  ) {
    return NextResponse.json({ error: "Dispositivo no asignado al mensajero" }, { status: 403 });
  }

  const evidenceWhere: Prisma.SecureEvidenceWhereInput = {
    deviceId: parsed.data.deviceId,
  };
  if (parsed.data.evidenceObjectIds.length) {
    evidenceWhere.objectId = { in: parsed.data.evidenceObjectIds };
  }

  const [evidences, packages, incidents] = await Promise.all([
    parsed.data.evidenceObjectIds.length
      ? prisma.secureEvidence.findMany({
          where: evidenceWhere,
          include: {
            mobileSyncJobs: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    parsed.data.packageIds.length
      ? prisma.mobileRoutePackage.findMany({
          where: {
            packageId: { in: parsed.data.packageIds },
            mobileDeviceId: device.id,
          },
        })
      : Promise.resolve([]),
    parsed.data.incidentIds.length
      ? prisma.mobileIncident.findMany({
          where: {
            incidentId: { in: parsed.data.incidentIds },
            mobileDeviceId: device.id,
          },
        })
      : Promise.resolve([]),
  ]);

  await prisma.$transaction([
    prisma.mobileDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    }),
    prisma.mobileSyncJob.create({
      data: {
        kind: MobileSyncJobKind.DEVICE_HEARTBEAT,
        status: MobileSyncJobStatus.SUCCEEDED,
        deviceId: parsed.data.deviceId,
        mobileDeviceId: device.id,
        messengerId: device.messengerId,
        attempts: 1,
        completedAt: new Date(),
        payload: {
          clientQueueDepth: parsed.data.clientQueueDepth ?? 0,
          lastClientSyncAt: parsed.data.lastClientSyncAt ?? null,
        },
      },
    }),
  ]);

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    device: {
      deviceId: device.deviceId,
      status: device.status,
      messengerId: device.messengerId,
    },
    evidences: evidences.map((evidence) => ({
      objectId: evidence.objectId,
      deliveryId: evidence.deliveryId,
      status: evidence.status,
      updatedAt: evidence.updatedAt.toISOString(),
      processingJob: evidence.mobileSyncJobs[0]
        ? {
            status: evidence.mobileSyncJobs[0].status,
            attempts: evidence.mobileSyncJobs[0].attempts,
            nextRunAt: evidence.mobileSyncJobs[0].nextRunAt.toISOString(),
            lastError: evidence.mobileSyncJobs[0].lastError,
          }
        : null,
    })),
    packages: packages.map((routePackage) => ({
      packageId: routePackage.packageId,
      status: routePackage.status,
      downloadedAt: routePackage.downloadedAt?.toISOString() ?? null,
      expiresAt: routePackage.expiresAt.toISOString(),
    })),
    incidents: incidents.map((incident) => ({
      incidentId: incident.incidentId,
      status: incident.status,
      severity: incident.severity,
      updatedAt: incident.updatedAt.toISOString(),
    })),
  });
}
