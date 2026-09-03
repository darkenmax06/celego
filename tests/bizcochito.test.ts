import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { firstCallArg, readJson, type TransactionalPrismaMock } from "./golden/helpers/mock-route";
import { createBizcochitoSnapshot, type BizcochitoCard } from "@/lib/bizcochito";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 2 (task 2.2).
 *
 * Covers:
 *  - `createBizcochitoSnapshot`'s new "tiene contrato" / "se subió imagen del
 *    contrato" columns (read from `hasContract`/`contractImageAt` directly).
 *  - The 3 widened query sites (`pendingCount`, `generateBizcochito`'s
 *    `findMany`, and its claim `updateMany`) plus the `logs` filter, all now
 *    matching `DIGITAL_DELIVERY_STATUSES` (ENTREGA_DIGITAL +
 *    ENTREGA_DIGITAL_SIN_CONTRATO) instead of only ENTREGA_DIGITAL.
 */

function baseCard(overrides: Partial<BizcochitoCard>): BizcochitoCard {
  return {
    id: "card-1",
    tc: "4000000000000001",
    externalReference: null,
    status: "ENTREGA_DIGITAL",
    isRemote: false,
    isAdditional: false,
    additionalIndex: 0,
    emissionType: null,
    deliveryType: null,
    supplier: null,
    contractType: null,
    provincia: "",
    zona: "",
    metadata: null,
    dispatchDate: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    digitalDeliveryCycle: 1,
    bizcochito: false,
    bizcochitoAt: null,
    hasContract: false,
    contractImageAt: null,
    contractImageFile: null,
    customer: {
      nombre: "Cliente Prueba",
      cedula: "00100000001",
      telefonosRaw: null,
      direccionRaw: null,
    },
    currentMessenger: null,
    reassignedMessenger: null,
    logs: [],
    routeItems: [],
    ...overrides,
  } as unknown as BizcochitoCard;
}

describe("createBizcochitoSnapshot — contract columns", () => {
  it("hasContract=false: tieneContrato NO, imagenContratoSubida blank", () => {
    const snapshot = createBizcochitoSnapshot(baseCard({ hasContract: false, contractImageAt: null }), "BIZ-1");
    expect(snapshot.tieneContrato).toBe("NO");
    expect(snapshot.imagenContratoSubida).toBe("");
  });

  it("hasContract=true, no image yet: tieneContrato SI, imagenContratoSubida NO", () => {
    const snapshot = createBizcochitoSnapshot(
      baseCard({ hasContract: true, contractImageAt: null }),
      "BIZ-1",
    );
    expect(snapshot.tieneContrato).toBe("SI");
    expect(snapshot.imagenContratoSubida).toBe("NO");
  });

  it("hasContract=true, image uploaded: tieneContrato SI, imagenContratoSubida SI", () => {
    const snapshot = createBizcochitoSnapshot(
      baseCard({ hasContract: true, contractImageAt: new Date("2026-01-02T00:00:00Z") }),
      "BIZ-1",
    );
    expect(snapshot.tieneContrato).toBe("SI");
    expect(snapshot.imagenContratoSubida).toBe("SI");
  });
});

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("./golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./golden/helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

vi.mock("@/lib/audit", () => ({
  writeAuditEvent: vi.fn(async () => undefined),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { GET as getBizcochitos } from "@/app/api/status-digitales/bizcochitos/route";
import { generateBizcochito } from "@/lib/bizcochito";

const prisma = prismaImport as unknown as TransactionalPrismaMock;

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("GET /api/status-digitales/bizcochitos — widened pendingCount", () => {
  it("counts both ENTREGA_DIGITAL and ENTREGA_DIGITAL_SIN_CONTRATO in the status filter", async () => {
    const response = await getBizcochitos(new NextRequest("http://localhost/api/status-digitales/bizcochitos"));
    await readJson(response);

    const callArg = firstCallArg(prisma.card.count as unknown as ReturnType<typeof vi.fn>);
    const statusFilter = (callArg.where as Record<string, unknown>).status as { in: string[] };
    expect(statusFilter.in).toEqual(
      expect.arrayContaining(["ENTREGA_DIGITAL", "ENTREGA_DIGITAL_SIN_CONTRATO"]),
    );
  });
});

describe("generateBizcochito — widened findMany + claim updateMany", () => {
  it("includes ENTREGA_DIGITAL_SIN_CONTRATO cards pending contract resolution", async () => {
    prisma.__seed("card", {
      id: "card-pending",
      tc: "4000000000000009",
      status: "ENTREGA_DIGITAL_SIN_CONTRATO",
      isRemote: false,
      isAdditional: false,
      additionalIndex: 0,
      digitalDeliveryCycle: 1,
      bizcochito: false,
      bizcochitoAt: null,
      hasContract: true,
      contractImageAt: null,
      contractImageFile: null,
      dispatchDate: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      externalReference: null,
      emissionType: null,
      deliveryType: null,
      supplier: null,
      contractType: null,
      provincia: "",
      zona: "",
      metadata: null,
      customer: { nombre: "Cliente Prueba", cedula: "00100000009", telefonosRaw: null, direccionRaw: null },
      currentMessenger: null,
      reassignedMessenger: null,
      logs: [],
      routeItems: [],
    } as never);

    const result = await generateBizcochito("current-user-1");

    expect(result).not.toBeNull();
    expect(result?.batch.itemCount).toBe(1);
    expect(prisma.__row("card", "card-pending")?.bizcochito).toBe(true);
  });
});
