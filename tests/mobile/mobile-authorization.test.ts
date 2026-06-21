import { CardStatus, MobileDeviceStatus, UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canAccessMobileAssignedCard,
  canRegisterEvidenceForRouteItem,
} from "../../lib/mobile-authorization";

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

describe("mobile assigned card authorization", () => {
  it("allows a messenger operating an active assigned open card", () => {
    expect(
      canAccessMobileAssignedCard({
        role: UserRole.MENSAJERO,
        sessionMessengerId: "msg-1",
        cardMessengerId: "msg-1",
        deviceMessengerId: "msg-1",
        deviceStatus: MobileDeviceStatus.ACTIVE,
        cardStatus: CardStatus.EN_RUTA,
      }),
    ).toEqual({ allowed: true });
  });

  it("rejects closed cards even when the messenger and device match", () => {
    expect(
      canAccessMobileAssignedCard({
        role: UserRole.MENSAJERO,
        sessionMessengerId: "msg-1",
        cardMessengerId: "msg-1",
        deviceMessengerId: "msg-1",
        deviceStatus: MobileDeviceStatus.ACTIVE,
        cardStatus: CardStatus.ENTREGADA,
      }),
    ).toMatchObject({
      allowed: false,
      reason: "card_not_open_for_mobile",
    });
  });

  it("rejects cross-messenger attempts even with an active device", () => {
    expect(
      canAccessMobileAssignedCard({
        role: UserRole.MENSAJERO,
        sessionMessengerId: "msg-1",
        cardMessengerId: "msg-2",
        deviceMessengerId: "msg-2",
        deviceStatus: MobileDeviceStatus.ACTIVE,
        cardStatus: CardStatus.DESPACHADA,
      }),
    ).toMatchObject({
      allowed: false,
      reason: "messenger_not_assigned_to_card",
    });
  });
});
