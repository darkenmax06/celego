import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  mobileDevice: {
    groupBy: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  card: {
    groupBy: vi.fn(),
    count: vi.fn(),
  },
  secureEvidence: {
    groupBy: vi.fn(),
  },
  mobileIncident: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  mobileSyncJob: {
    groupBy: vi.fn(),
  },
  messenger: {
    findMany: vi.fn(),
  },
}));

const mockRequireApiSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: mockRequireApiSession,
}));

function buildRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/mobile-pilot${query}`);
}

describe("GET /api/admin/mobile-pilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiSession.mockResolvedValue({
      session: {
        user: {
          id: "cmqcwm1yu000rqv4hpktmnadm",
          email: "admin@celego.local",
          role: "ADMIN",
        },
      },
    });

    mockPrisma.mobileDevice.groupBy.mockResolvedValue([
      { status: "ACTIVE", _count: { _all: 6 } },
      { status: "PENDING", _count: { _all: 1 } },
    ]);
    mockPrisma.mobileDevice.count.mockResolvedValue(0);
    mockPrisma.mobileDevice.findMany.mockResolvedValue([
      {
        id: "cmqcwm1yu000rqv4hpktmndev",
        deviceId: "DEV-PILOT-001",
        label: "Piloto 001",
        status: "ACTIVE",
        platform: "ANDROID",
        messenger: {
          id: "cmqcwm1z5000tqv4h5ijg6bzn",
          nombre: "Mensajero Piloto",
          provinciaTrabajo: "Santo Domingo",
          zonaPrincipal: "Metro",
        },
        lastSeenAt: new Date("2026-06-20T12:00:00.000Z"),
        updatedAt: new Date("2026-06-20T12:10:00.000Z"),
        _count: {
          secureEvidences: 3,
          mobileIncidents: 1,
        },
      },
    ]);

    mockPrisma.card.groupBy
      .mockResolvedValueOnce([
        { status: "EN_RUTA", _count: { _all: 9 } },
        { status: "DESPACHADA", _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([
        { provincia: "Santo Domingo", _count: { _all: 12 } },
      ]);
    mockPrisma.card.count.mockResolvedValue(12);

    mockPrisma.secureEvidence.groupBy
      .mockResolvedValueOnce([
        { status: "UPLOADED_RELAY", _count: { _all: 4 } },
        { status: "DECRYPTED", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { evidenceKind: "ACUSE", _count: { _all: 3 } },
        { evidenceKind: "CEDULA", _count: { _all: 3 } },
      ]);

    mockPrisma.mobileIncident.groupBy
      .mockResolvedValueOnce([{ status: "OPEN", _count: { _all: 1 } }])
      .mockResolvedValueOnce([{ severity: "MEDIUM", _count: { _all: 1 } }]);
    mockPrisma.mobileIncident.findMany.mockResolvedValue([
      {
        id: "cmqcwm1yu000rqv4hpktmninc",
        incidentId: "INC-PILOT-001",
        severity: "MEDIUM",
        status: "OPEN",
        type: "NETWORK_PROBLEM",
        title: "Intermitencia de red",
        description: "Calle Secreta 123 con cedula 001-1234567-8",
        deviceId: "DEV-PILOT-001",
        messenger: {
          id: "cmqcwm1z5000tqv4h5ijg6bzn",
          nombre: "Mensajero Piloto",
          provinciaTrabajo: "Santo Domingo",
          zonaPrincipal: "Metro",
        },
        reportedAt: new Date("2026-06-20T12:30:00.000Z"),
      },
    ]);

    mockPrisma.mobileSyncJob.groupBy
      .mockResolvedValueOnce([{ status: "SUCCEEDED", _count: { _all: 8 } }])
      .mockResolvedValueOnce([{ kind: "EVIDENCE_UPLOAD", _count: { _all: 6 } }]);

    mockPrisma.messenger.findMany.mockResolvedValue([
      {
        id: "cmqcwm1z5000tqv4h5ijg6bzn",
        nombre: "Mensajero Piloto",
        provinciaTrabajo: "Santo Domingo",
        zonaPrincipal: "Metro",
      },
    ]);
  });

  it("returns sanitized pilot readiness metrics for admins", async () => {
    const { GET } = await import("../../app/api/admin/mobile-pilot/route");

    const response = (await GET(buildRequest("?province=Santo%20Domingo")))!;
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.summary).toMatchObject({
      activeDevices: 6,
      openAssignments: 12,
      uploadedEvidence: 4,
      openIncidents: 1,
    });
    expect(json.devices[0]).toMatchObject({
      deviceId: "DEV-PILOT-001",
      status: "ACTIVE",
    });
    expect(json.incidents[0]).toMatchObject({
      incidentId: "INC-PILOT-001",
      title: "Intermitencia de red",
    });
    expect(serialized).not.toContain("001-1234567-8");
    expect(serialized).not.toContain("Calle Secreta");
    expect(serialized).not.toContain("4111");
    expect(serialized).not.toContain("encryptedKey");
    expect(serialized).not.toContain("tc");
  });

  it("rejects non-admin access through the shared API guard", async () => {
    const { GET } = await import("../../app/api/admin/mobile-pilot/route");
    mockRequireApiSession.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }),
    });

    const response = (await GET(buildRequest()))!;
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Sin permisos");
    expect(mockPrisma.mobileDevice.groupBy).not.toHaveBeenCalled();
  });
});
