import { MobileDeviceStatus, UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { resolveMobileDeviceRegistrationStatus } from "../../lib/mobile-device";

describe("mobile device registration status", () => {
  it("keeps an already active device active when a messenger registers again", () => {
    expect(
      resolveMobileDeviceRegistrationStatus({
        role: UserRole.MENSAJERO,
        existingStatus: MobileDeviceStatus.ACTIVE,
      }),
    ).toBe(MobileDeviceStatus.ACTIVE);
  });

  it("keeps new messenger devices pending until operations approves them", () => {
    expect(
      resolveMobileDeviceRegistrationStatus({
        role: UserRole.MENSAJERO,
      }),
    ).toBe(MobileDeviceStatus.PENDING);
  });

  it("allows operators to set a requested status explicitly", () => {
    expect(
      resolveMobileDeviceRegistrationStatus({
        role: UserRole.OPERADOR,
        requestedStatus: MobileDeviceStatus.ACTIVE,
        existingStatus: MobileDeviceStatus.PENDING,
      }),
    ).toBe(MobileDeviceStatus.ACTIVE);
  });
});
