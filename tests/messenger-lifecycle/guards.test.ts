import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionalPrismaMock } from "../golden/helpers/mock-route";
import { readJson } from "../golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "user-1", email: "op@example.com", role: "OPERADOR" } },
  })),
}));

vi.mock("@/lib/payroll/payments", () => ({
  openPayment: vi.fn(async () => ({ netCents: 0, id: "pay-1" })),
  rebalanceLoan: vi.fn(async () => undefined),
}));

vi.mock("@/lib/payroll/counting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payroll/counting")>()),
  lockStateFor: vi.fn(async () => ({ locked: false })),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { POST as postRuta, PATCH as patchRuta } from "@/app/api/rutas/route";
import { POST as postLote } from "@/app/api/lotes/route";
import { POST as postLoan, PATCH as patchLoan } from "@/app/api/mensajeros/prestamos/route";
import { POST as postDaily } from "@/app/api/mensajeros/gestion-diaria/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const ARCHIVED = "carchived00001";
const ACTIVE = "cactive0000001";

type Handler = (r: Request) => Promise<Response | undefined>;

function send(handler: Handler, method: string, body: unknown) {
  return handler(
    new Request("http://localhost/x", { method, body: JSON.stringify(body) }),
  ) as Promise<Response>;
}

const post = (handler: Handler, body: unknown) => send(handler, "POST", body);
const patch = (handler: Handler, body: unknown) => send(handler, "PATCH", body);

async function expectArchived(response: Response) {
  expect(response.status).toBe(409);
  expect(await readJson(response)).toEqual({ error: "Mensajero archivado" });
}

beforeEach(() => {
  prisma.__reset();
  prisma.__seed("messenger", { id: ARCHIVED, nombre: "Archivado", activo: false });
  prisma.__seed("messenger", { id: ACTIVE, nombre: "Activo", activo: true });
});

describe("POST /api/rutas (R5.2)", () => {
  const body = (messengerId: string) => ({
    fecha: "2026-10-01",
    messengerId,
    cardIds: ["ccard00000001"],
  });

  it("rejects an archived messenger with 409 and creates nothing", async () => {
    await expectArchived(await post(postRuta, body(ARCHIVED)));
    expect(prisma.route.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown messenger", async () => {
    expect((await post(postRuta, body("cghost0000001"))).status).toBe(404);
  });

  it("does not reject an active messenger at the guard", async () => {
    // Past the guard the handler looks cards up; with none seeded it answers
    // the pre-existing 409 about missing cards, never "Mensajero archivado".
    const response = await post(postRuta, body(ACTIVE));
    expect(await readJson(response)).not.toEqual({ error: "Mensajero archivado" });
  });
});

describe("POST /api/lotes (R5.3)", () => {
  const body = (messengerId: string) => ({
    messengerId,
    sentTo: "Santiago",
    fechaEnvio: "2026-10-01",
    identifiers: ["001-0000000-1"],
  });

  it("rejects an archived messenger with 409 and creates nothing", async () => {
    await expectArchived(await post(postLote, body(ARCHIVED)));
    expect(prisma.lot.create).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown messenger", async () => {
    expect((await post(postLote, body("cghost0000001"))).status).toBe(404);
  });
});

describe("POST /api/mensajeros/prestamos (R5.4)", () => {
  const body = (messengerId: string) => ({
    messengerId,
    principalCents: 10000,
    installmentCount: 2,
    mode: "IGUALES",
  });

  it("rejects an archived messenger with 409 and creates no loan", async () => {
    await expectArchived(await post(postLoan, body(ARCHIVED)));
    expect(prisma.loan.create).not.toHaveBeenCalled();
  });

  it("creates the loan for an active messenger", async () => {
    prisma.loan.create.mockResolvedValue({ id: "loan-1", principalCents: 10000, installments: [] });
    const response = await post(postLoan, body(ACTIVE));
    expect(response.status).toBe(201);
  });

  it("keeps loan edits allowed for an archived messenger (R5.5)", async () => {
    prisma.__seed("loan", { id: "cloan000000001", messengerId: ARCHIVED });
    const response = await patch(patchLoan, { action: "CANCEL", loanId: "cloan000000001" });
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ status: "CANCELADO" });
  });
});

describe("POST /api/mensajeros/gestion-diaria (R5.4)", () => {
  const record = (messengerId: string) => ({
    type: "record",
    messengerId,
    fecha: "2026-10-01",
    entregasNormales: 3,
  });

  it("rejects creating a NEW daily record for an archived messenger", async () => {
    prisma.messengerServiceRate.findMany.mockResolvedValue([]);
    prisma.messengerDailyRecord.findFirst.mockResolvedValue(null);

    await expectArchived(await post(postDaily, record(ARCHIVED)));
    expect(prisma.messengerDailyRecord.create).not.toHaveBeenCalled();
  });

  it("still allows editing an existing day of an archived messenger (R5.5)", async () => {
    prisma.messengerServiceRate.findMany.mockResolvedValue([]);
    prisma.messengerDailyRecord.findFirst.mockResolvedValue({ id: "rec-1", autoNormales: 0, autoRemotas: 0 });
    prisma.messengerDailyRecord.update.mockResolvedValue({ id: "rec-1" });

    const response = await post(postDaily, record(ARCHIVED));

    expect(response.status).toBe(200);
    expect(prisma.messengerDailyRecord.update).toHaveBeenCalled();
  });

  it("creates a new daily record for an active messenger", async () => {
    prisma.messengerServiceRate.findMany.mockResolvedValue([]);
    prisma.messengerDailyRecord.findFirst.mockResolvedValue(null);
    prisma.messengerDailyRecord.create.mockResolvedValue({ id: "rec-2" });

    expect((await post(postDaily, record(ACTIVE))).status).toBe(200);
    expect(prisma.messengerDailyRecord.create).toHaveBeenCalled();
  });

  it("still allows reports for an archived messenger", async () => {
    prisma.messengerDailyRecord.findMany.mockResolvedValue([]);
    prisma.messengerReport.create.mockResolvedValue({ id: "rep-1" });

    const response = await post(postDaily, {
      type: "report",
      messengerId: ARCHIVED,
      from: "2026-10-01",
      to: "2026-10-07",
    });

    expect(response.status).toBe(201);
  });
});

describe("route operations on archived messengers (R5.6)", () => {
  it("lets operators close an open route", async () => {
    prisma.route.update.mockResolvedValue({ id: "route-1", messengerId: ARCHIVED, status: "COMPLETADA" });

    const response = await patch(patchRuta, {
      action: "UPDATE_ROUTE_STATUS",
      routeId: "croute00000001",
      status: "COMPLETADA",
    });

    expect(response.status).toBe(200);
    expect(prisma.messenger.findUnique).not.toHaveBeenCalled();
  });
});
