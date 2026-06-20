import { MobileDeviceStatus, UserRole } from "@prisma/client";

export function resolveMobileDeviceRegistrationStatus(input: {
  role: UserRole;
  requestedStatus?: MobileDeviceStatus;
  existingStatus?: MobileDeviceStatus | null;
}) {
  const canSetStatus = input.role === UserRole.ADMIN || input.role === UserRole.OPERADOR;
  if (canSetStatus && input.requestedStatus) {
    return input.requestedStatus;
  }

  return input.existingStatus ?? MobileDeviceStatus.PENDING;
}
