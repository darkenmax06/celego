import { NextRequest, NextResponse } from "next/server";
import {
  MobileDeviceStatus,
  MobileRoutePackageStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import {
  CreateMobileRoutePackageSchema,
  MobileRoutePackageManifestSchema,
} from "@/packages/contracts/src";
import {
  buildMobileRoutePackageManifest,
  defaultRoutePackageExpiry,
} from "@/lib/mobile-route-package";
import { tryWriteAuditEvent } from "@/lib/audit";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

function serializePackage(row: {
  id: string;
  packageId: string;
  routeId: string;
  messengerId: string;
  mobileDeviceId: string | null;
  deliveryDate: Date;
  expiresAt: Date;
  status: MobileRoutePackageStatus;
  downloadedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    packageId: row.packageId,
    routeId: row.routeId,
    messengerId: row.messengerId,
    mobileDeviceId: row.mobileDeviceId,
    deliveryDate: row.deliveryDate.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    downloadedAt: row.downloadedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const deviceId = request.nextUrl.searchParams.get("deviceId")?.trim();
  const date = request.nextUrl.searchParams.get("date");
  const role = auth.session.user.role;

  const where: Prisma.MobileRoutePackageWhereInput = {};
  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.deliveryDate = { gte: start, lt: end };
  }
  if (role === UserRole.MENSAJERO) {
    if (!auth.session.user.messengerId) {
      return NextResponse.json({ error: "Mensajero requerido" }, { status: 400 });
    }
    where.messengerId = auth.session.user.messengerId;
  }
  if (deviceId) {
    where.mobileDevice = { deviceId };
  }

  const packages = await prisma.mobileRoutePackage.findMany({
    where,
    orderBy: [{ deliveryDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ packages: packages.map(serializePackage) });
}

export async function POST(request: NextRequest) {
  const auth = await requireMobileSession(request, [UserRole.OPERADOR, UserRole.ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = CreateMobileRoutePackageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [route, device] = await Promise.all([
    prisma.route.findUnique({
      where: { id: parsed.data.routeId },
      include: {
        items: {
          include: {
            card: {
              include: {
                customer: true,
              },
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
    }),
    prisma.mobileDevice.findUnique({
      where: { deviceId: parsed.data.deviceId },
    }),
  ]);

  if (!route) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }
  if (!route.items.length) {
    return NextResponse.json({ error: "La ruta no tiene items" }, { status: 400 });
  }
  if (!device) {
    return NextResponse.json({ error: "Dispositivo no registrado" }, { status: 404 });
  }
  if (device.status !== MobileDeviceStatus.ACTIVE) {
    return NextResponse.json({ error: "Dispositivo no activo" }, { status: 403 });
  }
  if (device.messengerId !== route.messengerId) {
    return NextResponse.json(
      { error: "El dispositivo no esta asignado al mensajero de la ruta" },
      { status: 403 },
    );
  }

  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : defaultRoutePackageExpiry(route.fecha);
  const manifest = buildMobileRoutePackageManifest({
    route,
    deviceId: device.deviceId,
    expiresAt,
  });
  const manifestValidation = MobileRoutePackageManifestSchema.safeParse(manifest);
  if (!manifestValidation.success) {
    return NextResponse.json(
      { error: "No se pudo generar paquete movil valido", issues: manifestValidation.error.issues },
      { status: 500 },
    );
  }

  const createdPackage = await prisma.mobileRoutePackage.create({
    data: {
      packageId: manifest.packageId,
      routeId: route.id,
      messengerId: route.messengerId,
      mobileDeviceId: device.id,
      deliveryDate: route.fecha,
      expiresAt,
      status: MobileRoutePackageStatus.CREATED,
      manifest: manifest as unknown as Prisma.InputJsonValue,
    },
  });

  await tryWriteAuditEvent({
    entity: "MOBILE_ROUTE_PACKAGE",
    entityId: createdPackage.id,
    action: "CREATE",
    userId: auth.session.user.id,
    actorEmail: auth.session.user.email,
    details: {
      packageId: createdPackage.packageId,
      routeId: route.id,
      deviceId: device.deviceId,
      itemCount: manifest.items.length,
    },
    request,
  });

  return NextResponse.json(
    {
      package: serializePackage(createdPackage),
      manifest,
    },
    { status: 201 },
  );
}
