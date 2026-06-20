import { MobileDeviceStatus, UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canRegisterEvidenceForRouteItem } from "../../lib/mobile-authorization";

describe("mobile route evidence authorization", () => {
  it("allows an active messenger device assigned to the same route messenger", () => {
    expect(
      canRegisterEvidenceForRouteItem({
        role: UserRole.MENSAJERO,
        sessionMessengerId: "msg-1",
        routeMessengerId: "msg-1",
        deviceMessengerId: "msg-1",
        deviceStatus: MobileDeviceStatus.ACTIVE,
      }),
    ).toEqual({ allowed: true });
  });

  it("rejects a messenger trying to register evidence for another messenger route", () => {
    expect(
      canRegisterEvidenceForRouteItem({
        role: UserRole.MENSAJERO,
        sessionMessengerId: "msg-1",
        routeMessengerId: "msg-2",
        deviceMessengerId: "msg-2",
        deviceStatus: MobileDeviceStatus.ACTIVE,
      }),
    ).toMatchObject({
      allowed: false,
      reason: "messenger_not_assigned_to_route",
    });
  });

  it("rejects inactive or revoked devices", () => {
    expect(
      canRegisterEvidenceForRouteItem({
        role: UserRole.ADMIN,
        sessionMessengerId: null,
        routeMessengerId: "msg-1",
        deviceMessengerId: "msg-1",
        deviceStatus: MobileDeviceStatus.REVOKED,
      }),
    ).toMatchObject({
      allowed: false,
      reason: "device_not_active",
    });
  });
});
