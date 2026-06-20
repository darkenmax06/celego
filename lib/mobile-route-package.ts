import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  MobileDeviceStatus,
  MobileRoutePackageStatus,
  UserRole,
} from "@prisma/client";
import {
  type CedulaVerificationToken,
  type MobileRoutePackageManifest,
} from "@/packages/contracts/src";

export type RouteForMobilePackage = {
  id: string;
  fecha: Date;
  messengerId: string;
  items: Array<{
    id: string;
    sequence: number;
    card: {
      externalReference: string | null;
      status: string;
      provincia: string;
      zona: string;
      customer: {
        cedula: string;
        nombre: string;
        direccionRaw: string | null;
      };
    };
  }>;
};

export type MobileRoutePackageAccessInput = {
  role: UserRole;
  sessionMessengerId: string | null;
  packageMessengerId: string;
  packageDeviceId: string | null;
  requestedDeviceId: string;
  deviceMessengerId: string | null;
  deviceStatus: MobileDeviceStatus;
  packageStatus: MobileRoutePackageStatus;
  expiresAt: Date;
  now?: Date;
};

export type MobileRoutePackageAccessResult =
  | { allowed: true }
  | { allowed: false; reason: string };

function normalizeCedula(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function createDeliveryId() {
  return `DLV-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export function createCedulaVerificationToken(
  cedula: string,
  salt = randomBytes(16).toString("base64url"),
): CedulaVerificationToken {
  const normalized = normalizeCedula(cedula);
  const hash = createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
  return {
    algorithm: "SHA-256-SALTED",
    salt,
    hash,
    last4: normalized.slice(-4).padStart(4, "0"),
  };
}

export function verifyCedulaVerificationToken(
  cedula: string,
  token: CedulaVerificationToken,
) {
  const expected = createCedulaVerificationToken(cedula, token.salt);
  return expected.hash.toLowerCase() === token.hash.toLowerCase();
}

export function defaultRoutePackageExpiry(routeDate: Date) {
  const expiresAt = new Date(routeDate);
  expiresAt.setHours(23, 59, 59, 999);
  expiresAt.setDate(expiresAt.getDate() + 1);
  return expiresAt;
}

export function buildMobileRoutePackageManifest(input: {
  route: RouteForMobilePackage;
  deviceId: string;
  expiresAt?: Date;
  now?: Date;
  packageId?: string;
}): MobileRoutePackageManifest {
  const now = input.now ?? new Date();
  const expiresAt = input.expiresAt ?? defaultRoutePackageExpiry(input.route.fecha);
  const packageId =
    input.packageId ?? `PKG-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

  return {
    packageId,
    routeId: input.route.id,
    messengerId: input.route.messengerId,
    deviceId: input.deviceId,
    deliveryDate: input.route.fecha.toISOString(),
    generatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    items: input.route.items.map((item) => ({
      routeItemId: item.id,
      deliveryId: createDeliveryId(),
      sequence: item.sequence,
      status: item.card.status,
      recipientName: item.card.customer.nombre,
      addressLine: normalizeOptionalText(item.card.customer.direccionRaw),
      province: normalizeOptionalText(item.card.provincia),
      zone: normalizeOptionalText(item.card.zona),
      reference: normalizeOptionalText(item.card.externalReference),
      cedulaVerification: createCedulaVerificationToken(item.card.customer.cedula),
    })),
  };
}

export function canDownloadMobileRoutePackage(
  input: MobileRoutePackageAccessInput,
): MobileRoutePackageAccessResult {
  const now = input.now ?? new Date();

  if (input.deviceStatus !== MobileDeviceStatus.ACTIVE) {
    return { allowed: false, reason: "device_not_active" };
  }

  if (!input.deviceMessengerId) {
    return { allowed: false, reason: "device_without_messenger" };
  }

  if (input.packageDeviceId !== input.requestedDeviceId) {
    return { allowed: false, reason: "package_device_mismatch" };
  }

  if (input.deviceMessengerId !== input.packageMessengerId) {
    return { allowed: false, reason: "device_not_assigned_to_package_messenger" };
  }

  if (input.packageStatus === MobileRoutePackageStatus.REVOKED) {
    return { allowed: false, reason: "package_revoked" };
  }

  if (input.packageStatus === MobileRoutePackageStatus.EXPIRED || input.expiresAt <= now) {
    return { allowed: false, reason: "package_expired" };
  }

  if (input.role === UserRole.MENSAJERO) {
    if (!input.sessionMessengerId) {
      return { allowed: false, reason: "messenger_session_without_messenger" };
    }
    if (input.sessionMessengerId !== input.packageMessengerId) {
      return { allowed: false, reason: "messenger_not_assigned_to_package" };
    }
  }

  return { allowed: true };
}
