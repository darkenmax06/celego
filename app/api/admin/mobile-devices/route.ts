import { MobileDeviceStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { writeAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const statusValues = Object.values(MobileDeviceStatus);

const updateSchema = z
  .object({
    id: z.string().cuid(),
    status: z.nativeEnum(MobileDeviceStatus).optional(),
    messengerId: z.string().cuid().nullable().optional(),
    label: z.string().trim().max(120).nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.messengerId !== undefined ||
      value.label !== undefined,
    "Debe indicar al menos un cambio",
  );

const deviceInclude = {
  messenger: {
    select: {
      id: true,
      nombre: true,
      activo: true,
      zonaPrincipal: true,
      provinciaTrabajo: true,
    },
  },
  mobilePackages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      packageId: true,
      status: true,
      deliveryDate: true,
      expiresAt: true,
      downloadedAt: true,
    },
  },
  _count: {
    select: {
      mobilePackages: true,
      secureEvidences: true,
      mobileIncidents: true,
    },
  },
} satisfies Prisma.MobileDeviceInclude;

type DeviceRow = Prisma.MobileDeviceGetPayload<{ include: typeof deviceInclude }>;

function serializeDevice(row: DeviceRow) {
  const lastPackage = row.mobilePackages[0] ?? null;

  return {
    id: row.id,
    deviceId: row.deviceId,
    label: row.label,
    platform: row.platform,
    status: row.status,
    messengerId: row.messengerId,
    messenger: row.messenger,
    certificateFingerprint: row.certificateFingerprint,
    publicKeyRegistered: Boolean(row.publicKey),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    counts: row._count,
    lastPackage: lastPackage
      ? {
          packageId: lastPackage.packageId,
          status: lastPackage.status,
          deliveryDate: lastPackage.deliveryDate.toISOString(),
          expiresAt: lastPackage.expiresAt.toISOString(),
          downloadedAt: lastPackage.downloadedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam && statusValues.includes(statusParam as MobileDeviceStatus)
      ? (statusParam as MobileDeviceStatus)
      : null;

  const where: Prisma.MobileDeviceWhereInput = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { deviceId: { contains: q, mode: "insensitive" } },
            { label: { contains: q, mode: "insensitive" } },
            { platform: { contains: q, mode: "insensitive" } },
            { certificateFingerprint: { contains: q, mode: "insensitive" } },
            { messenger: { nombre: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [devices, groups, messengers] = await Promise.all([
    prisma.mobileDevice.findMany({
      where,
      include: deviceInclude,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
    }),
    prisma.mobileDevice.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.messenger.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        zonaPrincipal: true,
        provinciaTrabajo: true,
      },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const summary = statusValues.reduce<Record<MobileDeviceStatus, number>>(
    (acc, value) => {
      acc[value] = 0;
      return acc;
    },
    {} as Record<MobileDeviceStatus, number>,
  );

  groups.forEach((group) => {
    summary[group.status] = group._count._all;
  });

  return NextResponse.json({
    devices: devices.map(serializeDevice),
    messengers,
    summary,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.mobileDevice.findUnique({
        where: { id: payload.id },
        include: { messenger: { select: { id: true, nombre: true } } },
      });
      if (!existing) throw new Error("DEVICE_NOT_FOUND");

      if (payload.messengerId) {
        const messenger = await tx.messenger.findUnique({
          where: { id: payload.messengerId },
          select: { id: true, activo: true },
        });
        if (!messenger || !messenger.activo) throw new Error("MESSENGER_NOT_FOUND");
      }

      const nextMessengerId =
        payload.messengerId !== undefined ? payload.messengerId : existing.messengerId;
      const nextStatus = payload.status ?? existing.status;

      if (nextStatus === MobileDeviceStatus.ACTIVE && !nextMessengerId) {
        throw new Error("ACTIVE_DEVICE_REQUIRES_MESSENGER");
      }

      const data: Prisma.MobileDeviceUpdateInput = {};
      if (payload.status !== undefined) data.status = payload.status;
      if (payload.label !== undefined) data.label = payload.label?.trim() || null;
      if (payload.messengerId !== undefined) {
        data.messenger = payload.messengerId
          ? { connect: { id: payload.messengerId } }
          : { disconnect: true };
      }
      data.lastSeenAt = existing.lastSeenAt;

      const device = await tx.mobileDevice.update({
        where: { id: existing.id },
        data,
        include: deviceInclude,
      });

      if (
        payload.status === MobileDeviceStatus.LOST ||
        payload.status === MobileDeviceStatus.REVOKED
      ) {
        await tx.mobileRoutePackage.updateMany({
          where: {
            mobileDeviceId: existing.id,
            status: { in: ["CREATED", "DOWNLOADED"] },
          },
          data: { status: "REVOKED" },
        });
      }

      await writeAuditEvent(
        {
          entity: "MOBILE_DEVICE",
          entityId: existing.id,
          action: "UPDATE",
          userId: auth.session.user.id,
          actorEmail: auth.session.user.email,
          details: {
            before: {
              deviceId: existing.deviceId,
              label: existing.label,
              status: existing.status,
              messengerId: existing.messengerId,
            },
            after: {
              label: device.label,
              status: device.status,
              messengerId: device.messengerId,
            },
          },
          request,
        },
        tx,
      );

      return device;
    });

    return NextResponse.json({ device: serializeDevice(updated) });
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, [string, number]> = {
        DEVICE_NOT_FOUND: ["Dispositivo no encontrado", 404],
        MESSENGER_NOT_FOUND: ["Mensajero no encontrado o inactivo", 400],
        ACTIVE_DEVICE_REQUIRES_MESSENGER: [
          "Un dispositivo activo debe estar asignado a un mensajero",
          400,
        ],
      };
      const known = messages[error.message];
      if (known) return NextResponse.json({ error: known[0] }, { status: known[1] });
    }
    throw error;
  }
}
