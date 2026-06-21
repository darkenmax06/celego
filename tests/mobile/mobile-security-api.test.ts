import { CardStatus, MobileDeviceStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const messengerId = "cmqcwm1z5000tqv4h5ijg6bzn";
const otherMessengerId = "cmqcwm1z5000tqv4h5ijg6oth";
const userId = "cmqcwm1yu000rqv4hpktmnusr";
const deviceDbId = "cmqcwm1yu000rqv4hpktmndev";
const deviceId = "DEV-C136A7F174";
const cardId = "cmqcwm1yu000rqv4hpktmnfca";
const otherCardId = "cmqcwm1yu000rqv4hpktmnoth";
const routeItemId = "cmqcwm1yu000rqv4hpktmnrti";

const mockTx = vi.hoisted(() => ({
  secureEvidence: {
    upsert: vi.fn(),
  },
  routeItem: {
    update: vi.fn(),
  },
  card: {
    update: vi.fn(),
  },
  cardStatusLog: {
    create: vi.fn(),
  },
  mobileSyncJob: {
    create: vi.fn(),
  },
  mobileIncident: {
    upsert: vi.fn(),
  },
  mobileDevice: {
    update: vi.fn(),
  },
}));

const mockPrisma = vi.hoisted(() => ({
  mobileDevice: {
    findUnique: vi.fn(),
  },
  routeItem: {
    findUnique: vi.fn(),
  },
  card: {
    findUnique: vi.fn(),
  },
  secureEvidence: {
    findFirst: vi.fn(),
  },
  mobileIncident: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(async (input: unknown) => {
    if (typeof input === "function") return input(mockTx);
    return Promise.all(input as Promise<unknown>[]);
  }),
}));

const mockRequireMobileSession = vi.hoisted(() => vi.fn());
const mockClearUrgencyOnCardClosure = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/mobile-session", () => ({
  requireMobileSession: mockRequireMobileSession,
}));
vi.mock("@/lib/urgent-alerts", () => ({
  clearUrgencyOnCardClosure: mockClearUrgencyOnCardClosure,
}));
vi.mock("@/packages/contracts/src", async () => await import("../../packages/contracts/src"));
vi.mock("@/lib/mobile-authorization", async () => await import("../../lib/mobile-authorization"));
vi.mock("@/lib/mobile-sync", async () => await import("../../lib/mobile-sync"));

function buildPostRequest(path: string, payload: unknown) {
  return new NextRequest(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: "Bearer test-token",
    },
    body: JSON.stringify(payload),
  });
}

function mockSession(role = UserRole.MENSAJERO, sessionMessengerId: string | null = messengerId) {
  mockRequireMobileSession.mockResolvedValue({
    session: {
      user: {
        id: userId,
        email: "demo.mensajero@celego.local",
        name: "Mensajero Demo",
        role,
        messengerId: sessionMessengerId,
      },
    },
  });
}

function mockActiveDevice(
  status: MobileDeviceStatus = MobileDeviceStatus.ACTIVE,
  assignedMessengerId: string | null = messengerId,
) {
  mockPrisma.mobileDevice.findUnique.mockResolvedValue({
    id: deviceDbId,
    deviceId,
    messengerId: assignedMessengerId,
    status,
  });
}

function buildCard(
  status: CardStatus = CardStatus.EN_RUTA,
  assignedMessengerId: string | null = messengerId,
) {
  return {
    id: cardId,
    currentMessengerId: assignedMessengerId,
    status,
  };
}

function buildRouteItem(itemCardId = cardId, routeMessengerId = messengerId) {
  return {
    id: routeItemId,
    routeId: "cmqcwm1yu000rqv4hpktmnrte",
    cardId: itemCardId,
    route: {
      id: "cmqcwm1yu000rqv4hpktmnrte",
      messengerId: routeMessengerId,
    },
    card: {
      id: itemCardId,
      currentMessengerId: routeMessengerId,
      status: CardStatus.EN_RUTA,
    },
  };
}

function buildEvidencePayload(overrides: Record<string, unknown> = {}) {
  return {
    deliveryId: "DLV-SEC-001",
    deviceId,
    objectId: "OBJ-SEC-001",
    evidenceKind: "ACUSE",
    capturedAt: "2026-06-20T12:00:00.000Z",
    expiresAt: "2026-06-23T12:00:00.000Z",
    encryption: {
      algorithm: "AES-256-GCM",
      keyEncryptionAlgorithm: "RSA-OAEP-SHA256",
      encryptedKey: Buffer.alloc(256, 1).toString("base64"),
      nonce: Buffer.alloc(12, 2).toString("base64"),
      authTag: Buffer.alloc(16, 3).toString("base64"),
    },
    blob: {
      sha256: "a".repeat(64),
      byteSize: 128,
      mimeType: "application/octet-stream",
    },
    cardId,
    ...overrides,
  };
}

function buildIncidentPayload(overrides: Record<string, unknown> = {}) {
  return {
    incidentId: "INC-SEC-001",
    deviceId,
    cardId,
    type: "SECURITY_CONCERN",
    severity: "HIGH",
    title: "Validacion de seguridad",
    description: "El equipo reporto una condicion operativa anomala",
    reportedAt: "2026-06-20T12:30:00.000Z",
    ...overrides,
  };
}

describe("mobile security API guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession();
    mockActiveDevice();
    mockPrisma.card.findUnique.mockResolvedValue(buildCard());
    mockPrisma.routeItem.findUnique.mockResolvedValue(null);
    mockPrisma.secureEvidence.findFirst.mockResolvedValue(null);
    mockTx.secureEvidence.upsert.mockResolvedValue({
      id: "cmqcwm1yu000rqv4hpktmnevd",
      deliveryId: "DLV-SEC-001",
      objectId: "OBJ-SEC-001",
      deviceId,
      mobileDeviceId: deviceDbId,
      messengerId,
      routeId: null,
      routeItemId: null,
      evidenceKind: "ACUSE",
      sha256: "a".repeat(64),
      status: "UPLOADED_RELAY",
    });
    mockTx.mobileIncident.upsert.mockResolvedValue({
      id: "cmqcwm1yu000rqv4hpktmninc",
      incidentId: "INC-SEC-001",
      severity: "HIGH",
      status: "OPEN",
      type: "SECURITY_CONCERN",
      title: "Validacion de seguridad",
      description: "El equipo reporto una condicion operativa anomala",
      deviceId,
      routeItemId: null,
      evidenceObjectId: null,
      messengerId,
      routeId: null,
      reportedAt: new Date("2026-06-20T12:30:00.000Z"),
      createdAt: new Date("2026-06-20T12:30:00.000Z"),
      updatedAt: new Date("2026-06-20T12:30:00.000Z"),
    });
  });

  it("rejects encrypted evidence for closed assigned cards", async () => {
    const { POST } = await import("../../app/api/mobile/evidencias/cifradas/route");
    mockPrisma.card.findUnique.mockResolvedValueOnce(buildCard(CardStatus.ENTREGADA));

    const response = (await POST(
      buildPostRequest("http://localhost/api/mobile/evidencias/cifradas", buildEvidencePayload()),
    ))!;
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      error: "No autorizado",
      reason: "card_not_open_for_mobile",
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects route item manipulation when it points to a different card", async () => {
    const { POST } = await import("../../app/api/mobile/evidencias/cifradas/route");
    mockPrisma.routeItem.findUnique.mockResolvedValueOnce(buildRouteItem(otherCardId));

    const response = (await POST(
      buildPostRequest(
        "http://localhost/api/mobile/evidencias/cifradas",
        buildEvidencePayload({ routeItemId }),
      ),
    ))!;
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("routeItemId no corresponde a cardId");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects reused evidence identifiers with inconsistent metadata", async () => {
    const { POST } = await import("../../app/api/mobile/evidencias/cifradas/route");
    mockPrisma.secureEvidence.findFirst.mockResolvedValueOnce({
      objectId: "OBJ-SEC-001",
      deliveryId: "DLV-OTHER",
      cardId,
      deviceId,
      sha256: "a".repeat(64),
    });

    const response = (await POST(
      buildPostRequest("http://localhost/api/mobile/evidencias/cifradas", buildEvidencePayload()),
    ))!;
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe("Evidencia duplicada con datos inconsistentes");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects incident reports from revoked devices", async () => {
    const { POST } = await import("../../app/api/mobile/incidents/route");
    mockActiveDevice(MobileDeviceStatus.REVOKED);

    const response = (await POST(
      buildPostRequest("http://localhost/api/mobile/incidents", buildIncidentPayload()),
    ))!;
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Dispositivo no activo");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects incident reports with accidental sensitive fields", async () => {
    const { POST } = await import("../../app/api/mobile/incidents/route");

    const response = (await POST(
      buildPostRequest(
        "http://localhost/api/mobile/incidents",
        buildIncidentPayload({
          technicalMetadata: {
            telefono: "809-555-9999",
          },
        }),
      ),
    ))!;
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: "Incidencia contiene PII no permitida",
      path: "$.technicalMetadata.telefono",
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a messenger trying to report an incident for another messenger card", async () => {
    const { POST } = await import("../../app/api/mobile/incidents/route");
    mockPrisma.card.findUnique.mockResolvedValueOnce(buildCard(CardStatus.EN_RUTA, otherMessengerId));

    const response = (await POST(
      buildPostRequest("http://localhost/api/mobile/incidents", buildIncidentPayload()),
    ))!;
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      error: "No autorizado",
      reason: "device_not_assigned_to_card_messenger",
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
