import { CardStatus, MobileDeviceStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const messengerId = "cmqcwm1z5000tqv4h5ijg6bzn";

const mockPrisma = vi.hoisted(() => ({
  mobileDevice: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  card: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

const mockRequireMobileSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/mobile-session", () => ({
  requireMobileSession: mockRequireMobileSession,
}));
vi.mock("@/packages/contracts/src", async () => await import("../../packages/contracts/src"));
vi.mock("@/lib/mobile-assignments", async () => await import("../../lib/mobile-assignments"));
vi.mock("@/lib/mobile-authorization", async () => await import("../../lib/mobile-authorization"));

function buildRequest(path = "http://localhost/api/mobile/assignments?deviceId=DEV-C136A7F174") {
  return new NextRequest(path, {
    headers: { authorization: "Bearer test-token" },
  });
}

function mockSession() {
  mockRequireMobileSession.mockResolvedValue({
    session: {
      user: {
        id: "cmqcwm1yu000rqv4hpktmnusr",
        email: "demo.mensajero@celego.local",
        name: "Mensajero Demo",
        role: UserRole.MENSAJERO,
        messengerId,
      },
    },
  });
}

function buildCard(status = CardStatus.EN_RUTA) {
  return {
    id: "cmqcwm1yu000rqv4hpktmnfca",
    externalReference: "REF-OPERATIVA-001",
    status,
    provincia: "Santo Domingo",
    zona: "Metro",
    updatedAt: new Date("2026-06-20T10:30:00.000Z"),
    customer: {
      cedula: "001-1234567-8",
      nombre: "Cliente Demo",
      direccionRaw: "Calle Operativa 12",
    },
    routeItems: [],
  };
}

describe("GET /api/mobile/assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession();
    mockPrisma.mobileDevice.findUnique.mockResolvedValue({
      id: "cmqcwm1yu000rqv4hpktmndev",
      deviceId: "DEV-C136A7F174",
      messengerId,
      status: MobileDeviceStatus.ACTIVE,
    });
    mockPrisma.mobileDevice.update.mockResolvedValue({});
    mockPrisma.card.count.mockResolvedValue(1);
    mockPrisma.card.findMany.mockResolvedValue([buildCard()]);
  });

  it("returns only minimum operational assignment data", async () => {
    const { GET } = await import("../../app/api/mobile/assignments/route");

    const response = await GET(buildRequest());
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.assignments).toHaveLength(1);
    expect(json.assignments[0]).toMatchObject({
      cardId: "cmqcwm1yu000rqv4hpktmnfca",
      recipientName: "Cliente Demo",
      status: CardStatus.EN_RUTA,
    });
    expect(serialized).not.toContain("001-1234567-8");
    expect(serialized).not.toContain("00112345678");
    expect(serialized).not.toContain("tc");
    expect(mockPrisma.card.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          currentMessengerId: messengerId,
          status: {
            in: [CardStatus.DESPACHADA, CardStatus.ENVIADA_INTERIOR, CardStatus.EN_RUTA],
          },
        },
      }),
    );
  });

  it("rejects inactive devices before returning assignments", async () => {
    const { GET } = await import("../../app/api/mobile/assignments/route");
    mockPrisma.mobileDevice.findUnique.mockResolvedValueOnce({
      id: "cmqcwm1yu000rqv4hpktmndev",
      deviceId: "DEV-C136A7F174",
      messengerId,
      status: MobileDeviceStatus.REVOKED,
    });

    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Dispositivo no activo");
    expect(mockPrisma.card.findMany).not.toHaveBeenCalled();
  });
});
