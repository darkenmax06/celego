import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJson, type TransactionalPrismaMock } from "./golden/helpers/mock-route";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 2 (task 2.1).
 *
 * Drives the real `POST /api/status-digitales` handler through the
 * transactional Prisma mock harness (same pattern as
 * `tests/golden/route-lot-outcome-characterization.test.ts`).
 */

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("./golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./golden/helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

vi.mock("@/lib/urgent-alerts", () => ({
  classifyCardLifecycle: vi.fn(() => "ACTIVE"),
  clearUrgencyOnCardClosure: vi.fn(async () => undefined),
  parkUrgencyOnPendingReception: vi.fn(async () => undefined),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { POST as postStatusDigitales } from "@/app/api/status-digitales/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;

function req(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function seedCard(overrides: Record<string, unknown>) {
  const row = {
    id: overrides.id,
    tc: overrides.tc,
    externalReference: null,
    status: overrides.status ?? "EN_RUTA",
    isRemote: false,
    returnReason: null,
    digitalDeliveryCycle: overrides.digitalDeliveryCycle ?? 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    dispatchDate: new Date("2026-01-01T00:00:00Z"),
    hasContract: overrides.hasContract ?? false,
    contractImageAt: overrides.contractImageAt ?? null,
    contractImageFile: overrides.contractImageFile ?? null,
    customer: { nombre: overrides.nombre ?? "Cliente Prueba", cedula: overrides.cedula ?? "00100000001" },
    ...overrides,
  };
  prisma.__seed("card", row as never);
  return row;
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("POST /api/status-digitales — contract exception (hasContract)", () => {
  it("hasContract=false: delivery image only -> ENTREGA_DIGITAL, unchanged from today", async () => {
    seedCard({ id: "card-1", tc: "4000000000000001", hasContract: false });

    const response = await postStatusDigitales(
      req({
        items: [{ fileName: "4000000000000001.jpg", identifier: "4000000000000001", isRemote: false }],
      }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(200);
    expect(prisma.__row("card", "card-1")?.status).toBe("ENTREGA_DIGITAL");
    expect((body.summary as Record<string, unknown>).contractWarnings ?? 0).toBe(0);
  });

  it("hasContract=true, delivery only, no (C) image -> ENTREGA_DIGITAL_SIN_CONTRATO + warning", async () => {
    seedCard({ id: "card-2", tc: "4000000000000002", hasContract: true });

    const response = await postStatusDigitales(
      req({
        items: [{ fileName: "4000000000000002.jpg", identifier: "4000000000000002", isRemote: false }],
      }),
    );
    const body = await readJson(response);

    expect((response as Response).status).toBe(200);
    expect(prisma.__row("card", "card-2")?.status).toBe("ENTREGA_DIGITAL_SIN_CONTRATO");
    expect(prisma.__row("card", "card-2")?.contractImageAt).toBeNull();
    const summary = body.summary as Record<string, unknown>;
    expect(summary.contractWarnings).toBe(1);
    expect(body.contractWarningCards).toContain("4000000000000002");
  });

  it("hasContract=true, delivery + (C) both present -> ENTREGA_DIGITAL, contractImageAt set", async () => {
    seedCard({ id: "card-3", tc: "4000000000000003", hasContract: true });

    const response = await postStatusDigitales(
      req({
        items: [
          { fileName: "4000000000000003.jpg", identifier: "4000000000000003", isRemote: false },
          { fileName: "4000000000000003 (C).jpg", identifier: "4000000000000003", isRemote: false },
        ],
      }),
    );

    expect((response as Response).status).toBe(200);
    const row = prisma.__row("card", "card-3");
    expect(row?.status).toBe("ENTREGA_DIGITAL");
    expect(row?.contractImageAt).toBeInstanceOf(Date);
  });

  it("hasContract=true, card already ENTREGA_DIGITAL_SIN_CONTRATO, batch has only (C) image -> resolves to ENTREGA_DIGITAL", async () => {
    seedCard({
      id: "card-4",
      tc: "4000000000000004",
      hasContract: true,
      status: "ENTREGA_DIGITAL_SIN_CONTRATO",
      digitalDeliveryCycle: 1,
    });

    const response = await postStatusDigitales(
      req({
        items: [{ fileName: "4000000000000004 (C).jpg", identifier: "4000000000000004", isRemote: false }],
      }),
    );

    expect((response as Response).status).toBe(200);
    const row = prisma.__row("card", "card-4");
    expect(row?.status).toBe("ENTREGA_DIGITAL");
    expect(row?.contractImageAt).toBeInstanceOf(Date);
    // no double-count: card entered the digital cycle already at SIN_CONTRATO
    expect(row?.digitalDeliveryCycle).toBe(1);
  });
});
