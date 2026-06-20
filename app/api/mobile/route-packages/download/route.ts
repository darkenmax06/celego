import { NextRequest, NextResponse } from "next/server";
import { MobileRoutePackageStatus, UserRole } from "@prisma/client";
import {
  DownloadMobileRoutePackageSchema,
  MobileRoutePackageManifestSchema,
} from "@/packages/contracts/src";
import { tryWriteAuditEvent } from "@/lib/audit";
import { canDownloadMobileRoutePackage } from "@/lib/mobile-route-package";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = DownloadMobileRoutePackageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const routePackage = await prisma.mobileRoutePackage.findUnique({
    where: { packageId: parsed.data.packageId },
    include: {
      mobileDevice: true,
    },
  });
  if (!routePackage) {
    return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 });
  }
  if (!routePackage.mobileDevice) {
    return NextResponse.json({ error: "Paquete sin dispositivo asociado" }, { status: 409 });
  }

  const access = canDownloadMobileRoutePackage({
    role: auth.session.user.role,
    sessionMessengerId: auth.session.user.messengerId,
    packageMessengerId: routePackage.messengerId,
    packageDeviceId: routePackage.mobileDevice.deviceId,
    requestedDeviceId: parsed.data.deviceId,
    deviceMessengerId: routePackage.mobileDevice.messengerId,
    deviceStatus: routePackage.mobileDevice.status,
    packageStatus: routePackage.status,
    expiresAt: routePackage.expiresAt,
  });

  if (!access.allowed) {
    if (access.reason === "package_expired") {
      await prisma.mobileRoutePackage.update({
        where: { id: routePackage.id },
        data: { status: MobileRoutePackageStatus.EXPIRED },
      });
    }
    await tryWriteAuditEvent({
      entity: "MOBILE_ROUTE_PACKAGE",
      entityId: routePackage.id,
      action: "DOWNLOAD",
      result: "DENIED",
      userId: auth.session.user.id,
      actorEmail: auth.session.user.email,
      details: {
        packageId: routePackage.packageId,
        deviceId: parsed.data.deviceId,
        reason: access.reason,
      },
      request,
    });
    return NextResponse.json({ error: "No autorizado", reason: access.reason }, { status: 403 });
  }

  const manifestValidation = MobileRoutePackageManifestSchema.safeParse(routePackage.manifest);
  if (!manifestValidation.success) {
    return NextResponse.json(
      { error: "Paquete movil corrupto o invalido" },
      { status: 500 },
    );
  }

  const updatedPackage = await prisma.mobileRoutePackage.update({
    where: { id: routePackage.id },
    data: {
      status:
        routePackage.status === MobileRoutePackageStatus.CREATED
          ? MobileRoutePackageStatus.DOWNLOADED
          : routePackage.status,
      downloadedAt: routePackage.downloadedAt ?? new Date(),
    },
  });

  await tryWriteAuditEvent({
    entity: "MOBILE_ROUTE_PACKAGE",
    entityId: routePackage.id,
    action: "DOWNLOAD",
    userId: auth.session.user.id,
    actorEmail: auth.session.user.email,
    details: {
      packageId: routePackage.packageId,
      deviceId: parsed.data.deviceId,
      itemCount: manifestValidation.data.items.length,
    },
    request,
  });

  return NextResponse.json({
    package: {
      id: updatedPackage.id,
      packageId: updatedPackage.packageId,
      status: updatedPackage.status,
      downloadedAt: updatedPackage.downloadedAt?.toISOString() ?? null,
      expiresAt: updatedPackage.expiresAt.toISOString(),
    },
    manifest: manifestValidation.data,
  });
}
