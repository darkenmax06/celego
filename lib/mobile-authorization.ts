import { MobileDeviceStatus, UserRole } from "@prisma/client";

export type MobileEvidenceAccessInput = {
  role: UserRole;
  sessionMessengerId: string | null;
  routeMessengerId: string;
  deviceMessengerId: string | null;
  deviceStatus: MobileDeviceStatus;
};

export type MobileEvidenceAccessResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function canRegisterEvidenceForRouteItem(
  input: MobileEvidenceAccessInput,
): MobileEvidenceAccessResult {
  if (input.deviceStatus !== MobileDeviceStatus.ACTIVE) {
    return { allowed: false, reason: "device_not_active" };
  }

  if (!input.deviceMessengerId) {
    return { allowed: false, reason: "device_without_messenger" };
  }

  if (input.deviceMessengerId !== input.routeMessengerId) {
    return { allowed: false, reason: "device_not_assigned_to_route_messenger" };
  }

  if (input.role === UserRole.MENSAJERO) {
    if (!input.sessionMessengerId) {
      return { allowed: false, reason: "messenger_session_without_messenger" };
    }
    if (input.sessionMessengerId !== input.routeMessengerId) {
      return { allowed: false, reason: "messenger_not_assigned_to_route" };
    }
  }

  return { allowed: true };
}
