import { CardStatus, MobileDeviceStatus, UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  MobileAssignmentCardSchema,
  MobileAssignmentsResponseSchema,
} from "../../packages/contracts/src";
import {
  serializeMobileAssignmentCard,
  type CardForMobileAssignment,
} from "../../lib/mobile-assignments";
import {
  canAccessMobileAssignedCard,
  isMobileOpenCardStatus,
} from "../../lib/mobile-authorization";
import { verifyCedulaVerificationToken } from "../../lib/mobile-route-package";

const messengerId = "cmqcwm1z5000tqv4h5ijg6bzn";

function buildCard(overrides: Partial<CardForMobileAssignment> = {}): CardForMobileAssignment {
  return {
    id: "cmqcwm1yu000rqv4hpktmnfca",
    externalReference: "REF-OPERATIVA-001",
    status: CardStatus.EN_RUTA,
    provincia: "Santo Domingo",
    zona: "Metro",
    updatedAt: new Date("2026-06-20T10:30:00.000Z"),
    customer: {
      cedula: "001-1234567-8",
      nombre: "Cliente Demo",
      direccionRaw: "Calle Operativa 12",
    },
    routeItems: [
      {
        id: "cmqcwm1yu000rqv4hpktmnfri",
        routeId: "cmqcwm1yu000rqv4hpktmnfrt",
        sequence: 4,
        route: {
          id: "cmqcwm1yu000rqv4hpktmnfrt",
          fecha: new Date("2026-06-20T00:00:00.000Z"),
          createdAt: new Date("2026-06-20T08:00:00.000Z"),
          messengerId,
        },
      },
    ],
    ...overrides,
  };
}

describe("mobile assignments", () => {
  it("serializes assigned cards without full cedula or card number", () => {
    const assignment = serializeMobileAssignmentCard(buildCard());
    const serialized = JSON.stringify(assignment);

    expect(MobileAssignmentCardSchema.safeParse(assignment).success).toBe(true);
    expect(serialized).not.toContain("001-1234567-8");
    expect(serialized).not.toContain("00112345678");
    expect(serialized).not.toContain("4111111111111111");
    expect(assignment.cedulaVerification.last4).toBe("5678");
    expect(verifyCedulaVerificationToken("00112345678", assignment.cedulaVerification)).toBe(true);
  });

  it("accepts a paginated response with minimum operational data", () => {
    const assignment = serializeMobileAssignmentCard(buildCard());
    const response = {
      deviceId: "DEV-C136A7F174",
      messengerId,
      generatedAt: "2026-06-20T10:31:00.000Z",
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
      assignments: [assignment],
    };

    expect(MobileAssignmentsResponseSchema.safeParse(response).success).toBe(true);
  });

  it("allows only open mobile card statuses", () => {
    expect(isMobileOpenCardStatus(CardStatus.DESPACHADA)).toBe(true);
    expect(isMobileOpenCardStatus(CardStatus.ENVIADA_INTERIOR)).toBe(true);
    expect(isMobileOpenCardStatus(CardStatus.EN_RUTA)).toBe(true);
    expect(isMobileOpenCardStatus(CardStatus.ACUSE_RECIBIDO)).toBe(false);
    expect(isMobileOpenCardStatus(CardStatus.ENTREGA_DIGITAL)).toBe(false);
    expect(isMobileOpenCardStatus(CardStatus.RETORNADA)).toBe(false);
  });

  it("authorizes only the assigned active messenger device", () => {
    expect(
      canAccessMobileAssignedCard({
        role: UserRole.MENSAJERO,
        sessionMessengerId: messengerId,
        cardMessengerId: messengerId,
        deviceMessengerId: messengerId,
        deviceStatus: MobileDeviceStatus.ACTIVE,
        cardStatus: CardStatus.EN_RUTA,
      }),
    ).toEqual({ allowed: true });

    expect(
      canAccessMobileAssignedCard({
        role: UserRole.MENSAJERO,
        sessionMessengerId: messengerId,
        cardMessengerId: "cmqcwm1z5000tqv4h5ijg6bzz",
        deviceMessengerId: "cmqcwm1z5000tqv4h5ijg6bzz",
        deviceStatus: MobileDeviceStatus.ACTIVE,
        cardStatus: CardStatus.EN_RUTA,
      }),
    ).toMatchObject({ allowed: false, reason: "messenger_not_assigned_to_card" });

    expect(
      canAccessMobileAssignedCard({
        role: UserRole.MENSAJERO,
        sessionMessengerId: messengerId,
        cardMessengerId: messengerId,
        deviceMessengerId: messengerId,
        deviceStatus: MobileDeviceStatus.ACTIVE,
        cardStatus: CardStatus.ENTREGADA,
      }),
    ).toMatchObject({ allowed: false, reason: "card_not_open_for_mobile" });
  });
});
