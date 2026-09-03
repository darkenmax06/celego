import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { firstCallArg, readJson, type TransactionalPrismaMock } from "./golden/helpers/mock-route";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 5 (task 5.2).
 *
 * `app/api/contratos-pendientes/route.ts`:
 *  - GET lists cards in ENTREGA_DIGITAL_SIN_CONTRATO / ENTREGA_SIN_CONTRATO
 *    with client fields.
 *  - POST { cardId, action: "SUBIR_CONTRATO", fileName } resolves the
 *    digital exception -> ENTREGA_DIGITAL.
 *  - POST { cardId, action: "MARCAR_ENTREGADO" } resolves the physical
 *    exception -> ACUSE_RECIBIDO.
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
import { GET as getPendientes, POST as postPendientes } from "@/app/api/contratos-pendientes/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;

function req(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function seedPendingCard(overrides: Record<string, unknown>) {
  prisma.__seed("card", {
    id: overrides.id,
    tc: overrides.tc,
    status: overrides.status,
    isRemote: false,
    returnReason: null,
    digitalDeliveryCycle: overrides.digitalDeliveryCycle ?? 1,
    hasContract: true,
    contractImageAt: overrides.contractImageAt ?? null,
    contractImageFile: null,
    provincia: "Santo Domingo",
    metadata: {},
    customer: {
      nombre: "Cliente Prueba",
      cedula: "00100000001",
      telefonosRaw: "8095551234",
    },
    ...overrides,
  } as never);
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("GET /api/contratos-pendientes", () => {
  it("queries hasContract=true and both exception statuses by default", async () => {
    seedPendingCard({ id: "card-a", tc: "4000000000000021", status: "ENTREGA_DIGITAL_SIN_CONTRATO" });

    const response = await getPendientes(new NextRequest("http://localhost/api/contratos-pendientes"));
    const body = await readJson(response);

    const args = firstCallArg(prisma.card.findMany);
    const where = args.where as Record<string, unknown>;
    expect(where.hasContract).toBe(true);
    expect((where.status as { in: string[] }).in).toEqual(
      expect.arrayContaining(["ENTREGA_DIGITAL_SIN_CONTRATO", "ENTREGA_SIN_CONTRATO"]),
    );

    const cards = body.cards as Array<Record<string, unknown>>;
    expect(cards.map((c) => c.id)).toContain("card-a");
  });

  it("filters by a single status when provided", async () => {
    seedPendingCard({ id: "card-b", tc: "4000000000000022", status: "ENTREGA_SIN_CONTRATO" });

    await getPendientes(
      new NextRequest("http://localhost/api/contratos-pendientes?status=ENTREGA_SIN_CONTRATO"),
    );

    const args = firstCallArg(prisma.card.findMany);
    const where = args.where as Record<string, unknown>;
    expect((where.status as { in: string[] }).in).toEqual(["ENTREGA_SIN_CONTRATO"]);
  });
});

describe("POST /api/contratos-pendientes — SUBIR_CONTRATO", () => {
  it("resolves ENTREGA_DIGITAL_SIN_CONTRATO -> ENTREGA_DIGITAL", async () => {
    seedPendingCard({ id: "card-a", tc: "4000000000000021", status: "ENTREGA_DIGITAL_SIN_CONTRATO" });

    const response = await postPendientes(
      req({ cardId: "card-a", action: "SUBIR_CONTRATO", fileName: "4000000000000021 (C).jpg" }),
    );

    expect((response as Response).status).toBe(200);
    const row = prisma.__row("card", "card-a");
    expect(row?.status).toBe("ENTREGA_DIGITAL");
    expect(row?.contractImageAt).toBeInstanceOf(Date);
  });

  it("rejects SUBIR_CONTRATO on a card not in ENTREGA_DIGITAL_SIN_CONTRATO", async () => {
    seedPendingCard({ id: "card-b", tc: "4000000000000022", status: "ENTREGA_SIN_CONTRATO" });

    const response = await postPendientes(
      req({ cardId: "card-b", action: "SUBIR_CONTRATO", fileName: "x.jpg" }),
    );

    expect((response as Response).status).toBe(409);
  });
});

describe("POST /api/contratos-pendientes — MARCAR_ENTREGADO", () => {
  it("resolves ENTREGA_SIN_CONTRATO -> ACUSE_RECIBIDO", async () => {
    seedPendingCard({ id: "card-b", tc: "4000000000000022", status: "ENTREGA_SIN_CONTRATO" });

    const response = await postPendientes(req({ cardId: "card-b", action: "MARCAR_ENTREGADO" }));

    expect((response as Response).status).toBe(200);
    expect(prisma.__row("card", "card-b")?.status).toBe("ACUSE_RECIBIDO");
  });

  it("rejects MARCAR_ENTREGADO on a card not in ENTREGA_SIN_CONTRATO", async () => {
    seedPendingCard({ id: "card-a", tc: "4000000000000021", status: "ENTREGA_DIGITAL_SIN_CONTRATO" });

    const response = await postPendientes(req({ cardId: "card-a", action: "MARCAR_ENTREGADO" }));

    expect((response as Response).status).toBe(409);
  });
});
