import { NextRequest, NextResponse } from "next/server";
import {
  CardStatus,
  MobileDeviceStatus,
  MobileIncidentSeverity,
  MobileIncidentStatus,
  MobileSyncJobKind,
  MobileSyncJobStatus,
  Prisma,
  SecureEvidenceKind,
  SecureEvidenceStatus,
} from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const OPEN_MOBILE_CARD_STATUSES = [
  CardStatus.DESPACHADA,
  CardStatus.ENVIADA_INTERIOR,
  CardStatus.EN_RUTA,
] as const;

const STALE_DEVICE_HOURS = 24;

type CountGroup = {
  [key: string]: string | { _all: number };
  _count: { _all: number };
};

type ChecklistStatus = "OK" | "WARN" | "BLOCKED";

function dateOrFallback(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function countBy<T extends string>(values: readonly T[], groups: CountGroup[], key: string) {
  const counts = values.reduce(
    (acc, value) => {
      acc[value] = 0;
      return acc;
    },
    {} as Record<T, number>,
  );

  groups.forEach((group) => {
    const value = group[key];
    if (typeof value === "string" && value in counts) {
      counts[value as T] = group._count._all;
    }
  });

  return counts;
}

function checklistItem(
  id: string,
  label: string,
  status: ChecklistStatus,
  detail: string,
) {
  return { id, label, status, detail };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(now.getDate() - 7);

  const from = startOfDay(dateOrFallback(request.nextUrl.searchParams.get("from"), defaultFrom));
  const to = endOfDay(dateOrFallback(request.nextUrl.searchParams.get("to"), now));
  const messengerId = request.nextUrl.searchParams.get("messengerId")?.trim() || null;
  const province = request.nextUrl.searchParams.get("province")?.trim() || null;
  const staleBefore = new Date(now.getTime() - STALE_DEVICE_HOURS * 60 * 60 * 1000);

  const messengerFilter: Prisma.MessengerWhereInput = {
    ...(messengerId ? { id: messengerId } : {}),
    ...(province
      ? { provinciaTrabajo: { equals: province, mode: "insensitive" } }
      : {}),
  };
  const deviceWhere: Prisma.MobileDeviceWhereInput = {
    ...(messengerId ? { messengerId } : {}),
    ...(province ? { messenger: messengerFilter } : {}),
  };
  const assignmentWhere: Prisma.CardWhereInput = {
    ...(messengerId ? { currentMessengerId: messengerId } : {}),
    ...(province ? { provincia: { equals: province, mode: "insensitive" } } : {}),
    status: { in: [...OPEN_MOBILE_CARD_STATUSES] },
  };
  const evidenceWhere: Prisma.SecureEvidenceWhereInput = {
    capturedAt: { gte: from, lte: to },
    ...(messengerId ? { messengerId } : {}),
    ...(province ? { card: { provincia: { equals: province, mode: "insensitive" } } } : {}),
  };
  const incidentWhere: Prisma.MobileIncidentWhereInput = {
    reportedAt: { gte: from, lte: to },
    ...(messengerId ? { messengerId } : {}),
    ...(province ? { messenger: messengerFilter } : {}),
  };
  const syncWhere: Prisma.MobileSyncJobWhereInput = {
    createdAt: { gte: from, lte: to },
    ...(messengerId ? { messengerId } : {}),
    ...(province ? { messenger: messengerFilter } : {}),
  };

  const [
    devicesByStatus,
    staleDevices,
    recentDevices,
    assignmentsByStatus,
    assignmentsByProvince,
    totalAssignments,
    evidenceByStatus,
    evidenceByKind,
    incidentsByStatus,
    incidentsBySeverity,
    recentIncidents,
    syncByStatus,
    syncByKind,
    messengers,
  ] = await Promise.all([
    prisma.mobileDevice.groupBy({
      by: ["status"],
      where: deviceWhere,
      _count: { _all: true },
    }),
    prisma.mobileDevice.count({
      where: {
        ...deviceWhere,
        status: MobileDeviceStatus.ACTIVE,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleBefore } }],
      },
    }),
    prisma.mobileDevice.findMany({
      where: deviceWhere,
      include: {
        messenger: {
          select: {
            id: true,
            nombre: true,
            zonaPrincipal: true,
            provinciaTrabajo: true,
          },
        },
        _count: {
          select: {
            secureEvidences: true,
            mobileIncidents: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 12,
    }),
    prisma.card.groupBy({
      by: ["status"],
      where: assignmentWhere,
      _count: { _all: true },
    }),
    prisma.card.groupBy({
      by: ["provincia"],
      where: assignmentWhere,
      _count: { _all: true },
      orderBy: { _count: { provincia: "desc" } },
      take: 8,
    }),
    prisma.card.count({ where: assignmentWhere }),
    prisma.secureEvidence.groupBy({
      by: ["status"],
      where: evidenceWhere,
      _count: { _all: true },
    }),
    prisma.secureEvidence.groupBy({
      by: ["evidenceKind"],
      where: evidenceWhere,
      _count: { _all: true },
    }),
    prisma.mobileIncident.groupBy({
      by: ["status"],
      where: incidentWhere,
      _count: { _all: true },
    }),
    prisma.mobileIncident.groupBy({
      by: ["severity"],
      where: incidentWhere,
      _count: { _all: true },
    }),
    prisma.mobileIncident.findMany({
      where: incidentWhere,
      include: {
        messenger: {
          select: {
            id: true,
            nombre: true,
            provinciaTrabajo: true,
            zonaPrincipal: true,
          },
        },
      },
      orderBy: [{ reportedAt: "desc" }],
      take: 10,
    }),
    prisma.mobileSyncJob.groupBy({
      by: ["status"],
      where: syncWhere,
      _count: { _all: true },
    }),
    prisma.mobileSyncJob.groupBy({
      by: ["kind"],
      where: syncWhere,
      _count: { _all: true },
    }),
    prisma.messenger.findMany({
      where: {
        activo: true,
        ...(province
          ? { provinciaTrabajo: { equals: province, mode: "insensitive" } }
          : {}),
      },
      select: {
        id: true,
        nombre: true,
        zonaPrincipal: true,
        provinciaTrabajo: true,
      },
      orderBy: { nombre: "asc" },
      take: 200,
    }),
  ]);

  const deviceCounts = countBy(Object.values(MobileDeviceStatus), devicesByStatus, "status");
  const assignmentCounts = countBy(Object.values(CardStatus), assignmentsByStatus, "status");
  const evidenceStatusCounts = countBy(
    Object.values(SecureEvidenceStatus),
    evidenceByStatus,
    "status",
  );
  const evidenceKindCounts = countBy(Object.values(SecureEvidenceKind), evidenceByKind, "evidenceKind");
  const incidentStatusCounts = countBy(
    Object.values(MobileIncidentStatus),
    incidentsByStatus,
    "status",
  );
  const incidentSeverityCounts = countBy(
    Object.values(MobileIncidentSeverity),
    incidentsBySeverity,
    "severity",
  );
  const syncStatusCounts = countBy(Object.values(MobileSyncJobStatus), syncByStatus, "status");
  const syncKindCounts = countBy(Object.values(MobileSyncJobKind), syncByKind, "kind");

  const criticalIncidents =
    incidentSeverityCounts.CRITICAL + incidentSeverityCounts.HIGH;
  const deadLetterJobs = syncStatusCounts.DEAD_LETTER;
  const openIncidents = incidentStatusCounts.OPEN + incidentStatusCounts.ACKNOWLEDGED;

  const checklist = [
    checklistItem(
      "active-devices",
      "Dispositivos activos",
      deviceCounts.ACTIVE >= 5 ? "OK" : "WARN",
      `${deviceCounts.ACTIVE} activo(s); meta de piloto: 5 a 10.`,
    ),
    checklistItem(
      "stale-heartbeats",
      "Latidos recientes",
      staleDevices === 0 ? "OK" : "WARN",
      `${staleDevices} dispositivo(s) activo(s) sin latido en ${STALE_DEVICE_HOURS}h.`,
    ),
    checklistItem(
      "open-assignments",
      "Tarjetas abiertas asignadas",
      totalAssignments > 0 ? "OK" : "BLOCKED",
      `${totalAssignments} tarjeta(s) abiertas visibles para cartera movil.`,
    ),
    checklistItem(
      "critical-incidents",
      "Incidencias criticas controladas",
      criticalIncidents === 0 ? "OK" : "BLOCKED",
      `${criticalIncidents} incidencia(s) HIGH/CRITICAL en la ventana.`,
    ),
    checklistItem(
      "sync-dead-letter",
      "Cola sin dead letters",
      deadLetterJobs === 0 ? "OK" : "WARN",
      `${deadLetterJobs} job(s) en DEAD_LETTER.`,
    ),
    checklistItem(
      "lost-revoked-review",
      "Perdidos/revocados revisados",
      deviceCounts.LOST + deviceCounts.REVOKED === 0 ? "OK" : "WARN",
      `${deviceCounts.LOST + deviceCounts.REVOKED} dispositivo(s) LOST/REVOKED.`,
    ),
  ];
  const readinessScore = Math.round(
    (checklist.filter((item) => item.status === "OK").length / checklist.length) * 100,
  );

  return NextResponse.json({
    generatedAt: now.toISOString(),
    filters: {
      from: from.toISOString(),
      to: to.toISOString(),
      messengerId,
      province,
      staleDeviceHours: STALE_DEVICE_HOURS,
    },
    summary: {
      readinessScore,
      activeDevices: deviceCounts.ACTIVE,
      pendingDevices: deviceCounts.PENDING,
      lostDevices: deviceCounts.LOST,
      revokedDevices: deviceCounts.REVOKED,
      staleDevices,
      openAssignments: totalAssignments,
      uploadedEvidence: evidenceStatusCounts.UPLOADED_RELAY,
      decryptedEvidence: evidenceStatusCounts.DECRYPTED,
      openIncidents,
      criticalIncidents,
      deadLetterJobs,
    },
    breakdowns: {
      devices: deviceCounts,
      assignments: assignmentCounts,
      assignmentsByProvince: assignmentsByProvince.map((group) => ({
        province: group.provincia,
        count: group._count._all,
      })),
      evidences: evidenceStatusCounts,
      evidenceKinds: evidenceKindCounts,
      incidents: incidentStatusCounts,
      incidentSeverity: incidentSeverityCounts,
      syncJobs: syncStatusCounts,
      syncKinds: syncKindCounts,
    },
    checklist,
    devices: recentDevices.map((device) => ({
      id: device.id,
      deviceId: device.deviceId,
      label: device.label,
      status: device.status,
      platform: device.platform,
      messenger: device.messenger
        ? {
            id: device.messenger.id,
            name: device.messenger.nombre,
            province: device.messenger.provinciaTrabajo,
            zone: device.messenger.zonaPrincipal,
          }
        : null,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      updatedAt: device.updatedAt.toISOString(),
      counts: {
        secureEvidences: device._count.secureEvidences,
        mobileIncidents: device._count.mobileIncidents,
      },
    })),
    incidents: recentIncidents.map((incident) => ({
      id: incident.id,
      incidentId: incident.incidentId,
      severity: incident.severity,
      status: incident.status,
      type: incident.type,
      title: incident.title,
      deviceId: incident.deviceId,
      messenger: incident.messenger
        ? {
            id: incident.messenger.id,
            name: incident.messenger.nombre,
            province: incident.messenger.provinciaTrabajo,
            zone: incident.messenger.zonaPrincipal,
          }
        : null,
      reportedAt: incident.reportedAt.toISOString(),
    })),
    messengers: messengers.map((messenger) => ({
      id: messenger.id,
      name: messenger.nombre,
      province: messenger.provinciaTrabajo,
      zone: messenger.zonaPrincipal,
    })),
  });
}
