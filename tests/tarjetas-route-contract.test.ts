import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstCallArg, readJson, type TransactionalPrismaMock } from "./golden/helpers/mock-route";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 4 (task 4.1).
 *
 * `PATCH /api/tarjetas` gains an optional `hasContract` field, editable
 * independent of `status`. Toggling it alone must NOT resolve
 * ENTREGA_DIGITAL_SIN_CONTRATO / ENTREGA_SIN_CONTRATO (spec: "Toggle after
 * exception status reached").
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
import { GET as getTarjetas, PATCH as patchTarjetas } from "@/app/api/tarjetas/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;

function req(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("PATCH /api/tarjetas — hasContract edit", () => {
  it("sets hasContract without touching status", async () => {
    prisma.__seed("card", {
      id: "cardhascontract1",
      tc: "4000000000000010",
      status: "EN_RUTA",
      isRemote: false,
      returnReason: null,
      digitalDeliveryCycle: 0,
      hasContract: false,
      metadata: {},
      customer: null,
      currentMessenger: null,
    } as never);

    const response = await patchTarjetas(req({ id: "cardhascontract1", hasContract: true }));
    const body = await readJson(response);

    expect((response as Response).status).toBe(200);
    expect((body.card as Record<string, unknown>).hasContract).toBe(true);
    expect((body.card as Record<string, unknown>).status).toBe("EN_RUTA");
  });

  it("toggling hasContract does NOT auto-resolve ENTREGA_DIGITAL_SIN_CONTRATO", async () => {
    prisma.__seed("card", {
      id: "cardexception1",
      tc: "4000000000000011",
      status: "ENTREGA_DIGITAL_SIN_CONTRATO",
      isRemote: false,
      returnReason: null,
      digitalDeliveryCycle: 1,
      hasContract: true,
      contractImageAt: null,
      metadata: {},
      customer: null,
      currentMessenger: null,
    } as never);

    const response = await patchTarjetas(req({ id: "cardexception1", hasContract: false }));
    const body = await readJson(response);

    expect((response as Response).status).toBe(200);
    expect((body.card as Record<string, unknown>).hasContract).toBe(false);
    expect((body.card as Record<string, unknown>).status).toBe("ENTREGA_DIGITAL_SIN_CONTRATO");
  });
});

/**
 * SDD card-groups — Work Unit C, Task 5.
 *
 * `?grupo=<id>` on `GET /api/tarjetas` MUST reach Prisma as the
 * `groupMemberships.some.groupId` relation clause, via the `relationSome`
 * descriptor filter wired in `lib/list-query/descriptors/tarjetas.ts`.
 */
describe("GET /api/tarjetas — grupo facet (card-groups Work Unit C)", () => {
  function getReq(url: string) {
    return new NextRequest(`http://localhost${url}`);
  }

  it("compiles a single grupo id to the relation clause", async () => {
    await getTarjetas(getReq("/api/tarjetas?grupo=g1"));
    expect(firstCallArg(prisma.card.findMany).where).toEqual({
      groupMemberships: { some: { groupId: "g1" } },
    });
  });

  it("compiles SIN_GRUPO to the none clause", async () => {
    await getTarjetas(getReq("/api/tarjetas?grupo=SIN_GRUPO"));
    expect(firstCallArg(prisma.card.findMany).where).toEqual({
      groupMemberships: { none: {} },
    });
  });
});
