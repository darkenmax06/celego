import { CardStatus, MobileDeviceStatus, UserRole } from "@prisma/client";

export const MOBILE_OPEN_CARD_STATUSES = [
  CardStatus.DESPACHADA,
  CardStatus.ENVIADA_INTERIOR,
  CardStatus.EN_RUTA,
] as const;

export type MobileEvidenceAccessInput = {
  role: UserRole;
  sessionMessengerId: string | null;
  routeMessengerId: string;
  deviceMessengerId: string | null;
  deviceStatus: MobileDeviceStatus;
};

export type MobileAssignedCardAccessInput = {
  role: UserRole;
  sessionMessengerId: string | null;
  cardMessengerId: string | null;
  deviceMessengerId: string | null;
  deviceStatus: MobileDeviceStatus;
  cardStatus: CardStatus;
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

export function isMobileOpenCardStatus(status: CardStatus) {
  return MOBILE_OPEN_CARD_STATUSES.includes(status as (typeof MOBILE_OPEN_CARD_STATUSES)[number]);
}

export function canAccessMobileAssignedCard(
  input: MobileAssignedCardAccessInput,
): MobileEvidenceAccessResult {
  if (input.deviceStatus !== MobileDeviceStatus.ACTIVE) {
    return { allowed: false, reason: "device_not_active" };
  }

  if (!input.deviceMessengerId) {
    return { allowed: false, reason: "device_without_messenger" };
  }

  if (!input.cardMessengerId) {
    return { allowed: false, reason: "card_without_messenger" };
  }

  if (input.deviceMessengerId !== input.cardMessengerId) {
    return { allowed: false, reason: "device_not_assigned_to_card_messenger" };
  }

  if (!isMobileOpenCardStatus(input.cardStatus)) {
    return { allowed: false, reason: "card_not_open_for_mobile" };
  }

  if (input.role === UserRole.MENSAJERO) {
    if (!input.sessionMessengerId) {
      return { allowed: false, reason: "messenger_session_without_messenger" };
    }
    if (input.sessionMessengerId !== input.cardMessengerId) {
      return { allowed: false, reason: "messenger_not_assigned_to_card" };
    }
  }

  return { allowed: true };
}
