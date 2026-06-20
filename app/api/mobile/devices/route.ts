import { NextRequest, NextResponse } from "next/server";
import { MobileDeviceStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

const deviceIdSchema = z
  .string()
  .min(6)
  .max(96)
  .regex(/^[a-zA-Z0-9._:-]+$/);

const registerDeviceSchema = z.object({
  deviceId: deviceIdSchema,
  label: z.string().trim().max(120).optional(),
  platform: z.string().trim().max(40).default("ANDROID"),
  publicKey: z.string().trim().max(4096).optional(),
  certificateFingerprint: z.string().trim().max(256).optional(),
  messengerId: z.string().cuid().optional(),
  status: z.nativeEnum(MobileDeviceStatus).optional(),
});

function serializeDevice(device: {
  id: string;
  deviceId: string;
  label: string | null;
  platform: string;
  status: MobileDeviceStatus;
  messengerId: string | null;
  certificateFingerprint: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: device.id,
    deviceId: device.deviceId,
    label: device.label,
    platform: device.platform,
    status: device.status,
    messengerId: device.messengerId,
    certificateFingerprint: device.certificateFingerprint,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
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
  const messengerIdParam = request.nextUrl.searchParams.get("messengerId");
  const statusParam = request.nextUrl.searchParams.get("status");

  const where: {
    messengerId?: string;
    status?: MobileDeviceStatus;
  } = {};

  if (role === UserRole.MENSAJERO) {
    if (!auth.session.user.messengerId) {
      return NextResponse.json({ error: "Mensajero requerido" }, { status: 400 });
    }
    where.messengerId = auth.session.user.messengerId;
  } else if (messengerIdParam) {
    where.messengerId = messengerIdParam;
  }

  if (statusParam && statusParam in MobileDeviceStatus) {
    where.status = statusParam as MobileDeviceStatus;
  }

  const devices = await prisma.mobileDevice.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ devices: devices.map(serializeDevice) });
}

export async function POST(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = registerDeviceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const role = auth.session.user.role;
  const messengerId =
    role === UserRole.MENSAJERO
      ? auth.session.user.messengerId
      : parsed.data.messengerId ?? auth.session.user.messengerId;

  if (!messengerId) {
    return NextResponse.json({ error: "messengerId requerido" }, { status: 400 });
  }

  const messenger = await prisma.messenger.findUnique({
    where: { id: messengerId },
    select: { id: true, activo: true },
  });
  if (!messenger || !messenger.activo) {
    return NextResponse.json({ error: "Mensajero no valido o inactivo" }, { status: 400 });
  }

  const requestedStatus = parsed.data.status;
  const nextStatus =
    role === UserRole.ADMIN || role === UserRole.OPERADOR
      ? requestedStatus ?? MobileDeviceStatus.PENDING
      : MobileDeviceStatus.PENDING;

  const device = await prisma.mobileDevice.upsert({
    where: { deviceId: parsed.data.deviceId },
    update: {
      label: parsed.data.label,
      platform: parsed.data.platform,
      publicKey: parsed.data.publicKey,
      certificateFingerprint: parsed.data.certificateFingerprint,
      messengerId,
      status: nextStatus,
      lastSeenAt: new Date(),
    },
    create: {
      deviceId: parsed.data.deviceId,
      label: parsed.data.label,
      platform: parsed.data.platform,
      publicKey: parsed.data.publicKey,
      certificateFingerprint: parsed.data.certificateFingerprint,
      messengerId,
      status: nextStatus,
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json({ device: serializeDevice(device) }, { status: 201 });
}
