import {
  MobileDeviceStatus,
  MobileRoutePackageStatus,
  UserRole,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { MobileRoutePackageManifestSchema } from "../../packages/contracts/src";
import {
  buildMobileRoutePackageManifest,
  canDownloadMobileRoutePackage,
  createCedulaVerificationToken,
  verifyCedulaVerificationToken,
  type RouteForMobilePackage,
} from "../../lib/mobile-route-package";

function buildRoute(): RouteForMobilePackage {
  return {
    id: "cmobilepkgroute000000000001",
    fecha: new Date("2026-06-20T08:00:00.000Z"),
    messengerId: "cmessenger000000000000001",
    items: [
      {
        id: "crouteitem000000000000001",
        sequence: 1,
        card: {
          externalReference: "REF-ENTREGA-001",
          status: "EN_RUTA",
          provincia: "Santo Domingo",
          zona: "Metro",
          customer: {
            cedula: "001-1234567-8",
            nombre: "Cliente Demo",
            direccionRaw: "Calle Operativa 12",
          },
        },
      },
    ],
  };
}

describe("mobile route package helpers", () => {
  it("builds a valid package without full cedula or card number", () => {
    const manifest = buildMobileRoutePackageManifest({
      route: buildRoute(),
      deviceId: "DEV-228",
      now: new Date("2026-06-20T09:00:00.000Z"),
      packageId: "PKG-TEST001",
    });
    const serialized = JSON.stringify(manifest);

    expect(MobileRoutePackageManifestSchema.safeParse(manifest).success).toBe(true);
    expect(serialized).not.toContain("001-1234567-8");
    expect(serialized).not.toContain("00112345678");
    expect(serialized).not.toContain("4111111111111111");
    expect(manifest.items[0].cedulaVerification.last4).toBe("5678");
    expect(manifest.items[0].routeItemId).toBe("crouteitem000000000000001");
  });

  it("verifies cedula locally using salt and hash", () => {
    const token = createCedulaVerificationToken("001-1234567-8", "salt-for-test-123");

    expect(verifyCedulaVerificationToken("00112345678", token)).toBe(true);
    expect(verifyCedulaVerificationToken("00112345679", token)).toBe(false);
  });

  it("allows package download only for active matching devices", () => {
    expect(
      canDownloadMobileRoutePackage({
        role: UserRole.MENSAJERO,
        sessionMessengerId: "msg-1",
        packageMessengerId: "msg-1",
        packageDeviceId: "DEV-1",
        requestedDeviceId: "DEV-1",
        deviceMessengerId: "msg-1",
        deviceStatus: MobileDeviceStatus.ACTIVE,
        packageStatus: MobileRoutePackageStatus.CREATED,
        expiresAt: new Date("2026-06-21T00:00:00.000Z"),
        now: new Date("2026-06-20T00:00:00.000Z"),
      }),
    ).toEqual({ allowed: true });
  });

  it("rejects package download for mismatched messenger or expired package", () => {
    expect(
      canDownloadMobileRoutePackage({
        role: UserRole.MENSAJERO,
        sessionMessengerId: "msg-2",
        packageMessengerId: "msg-1",
        packageDeviceId: "DEV-1",
        requestedDeviceId: "DEV-1",
        deviceMessengerId: "msg-1",
        deviceStatus: MobileDeviceStatus.ACTIVE,
        packageStatus: MobileRoutePackageStatus.CREATED,
        expiresAt: new Date("2026-06-21T00:00:00.000Z"),
        now: new Date("2026-06-20T00:00:00.000Z"),
      }),
    ).toMatchObject({
      allowed: false,
      reason: "messenger_not_assigned_to_package",
    });

    expect(
      canDownloadMobileRoutePackage({
        role: UserRole.OPERADOR,
        sessionMessengerId: null,
        packageMessengerId: "msg-1",
        packageDeviceId: "DEV-1",
        requestedDeviceId: "DEV-1",
        deviceMessengerId: "msg-1",
        deviceStatus: MobileDeviceStatus.ACTIVE,
        packageStatus: MobileRoutePackageStatus.CREATED,
        expiresAt: new Date("2026-06-19T00:00:00.000Z"),
        now: new Date("2026-06-20T00:00:00.000Z"),
      }),
    ).toMatchObject({
      allowed: false,
      reason: "package_expired",
    });
  });
});
