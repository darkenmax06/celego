import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaMock, firstCallArg, readJson } from "./helpers/mock-route";

/**
 * Task 16.5 — HANDLER-LEVEL goldens.
 *
 * Phases 1 and 10 could only assert route behaviour by reading source. These
 * tests EXECUTE the seven migrated handlers with `requireApiSession` and
 * `prisma` mocked and assert the real Prisma arguments they build, which closes
 * the batch's central exposure.
 */

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/mock-route");
  return { prisma: createPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

import { prisma as prismaImport } from "@/lib/prisma";
import { GET as getRutas } from "@/app/api/rutas/route";
import { GET as getLotes } from "@/app/api/lotes/route";
import { GET as getRedacciones } from "@/app/api/redacciones/route";
import { GET as getMensajeros } from "@/app/api/mensajeros/route";
import { GET as getConfigUsuarios } from "@/app/api/config/usuarios/route";
import { GET as getActividad } from "@/app/api/config/usuarios/[id]/actividad/route";
import { GET as getBizcochitos } from "@/app/api/status-digitales/bizcochitos/route";

const prisma = prismaImport as unknown as ReturnType<typeof createPrismaMock>;

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rutas GET", () => {
  it("compiles date + messengerId into where and keeps its include tree", async () => {
    prisma.route.findMany.mockResolvedValue([]);
    prisma.route.count.mockResolvedValue(0);

    await getRutas(req("/api/rutas?date=2026-08-29&messengerId=msg-1"));

    const args = firstCallArg(prisma.route.findMany);
    const where = args.where as { fecha: { gte: Date; lt: Date }; messengerId: string };
    expect(where.messengerId).toBe("msg-1");
    expect(where.fecha.gte.toISOString()).toBe("2026-08-29T00:00:00.000Z");
    expect(where.fecha.lt.getTime() - where.fecha.gte.getTime()).toBe(DAY_MS);
    expect(args.orderBy).toEqual([{ fecha: "desc" }, { createdAt: "desc" }]);
    expect(args.include).toEqual({
      messenger: true,
      items: {
        include: { card: { include: { customer: true } } },
        orderBy: { sequence: "asc" },
      },
    });
    expect(firstCallArg(prisma.route.count).where).toBe(args.where);
  });

  it("defaults to pageSize 20 and clamps to a max of 100", async () => {
    prisma.route.findMany.mockResolvedValue([]);
    prisma.route.count.mockResolvedValue(41);

    await getRutas(req("/api/rutas"));
    expect(firstCallArg(prisma.route.findMany)).toMatchObject({ skip: 0, take: 20 });

    vi.clearAllMocks();
    prisma.route.findMany.mockResolvedValue([]);
    prisma.route.count.mockResolvedValue(41);
    const response = await getRutas(req("/api/rutas?page=3&pageSize=500"));
    expect(firstCallArg(prisma.route.findMany)).toMatchObject({ skip: 200, take: 100 });

    const body = await readJson(response);
    expect(Object.keys(body)).toEqual(["routes", "pagination"]);
    expect(body.pagination).toEqual({ page: 3, pageSize: 100, total: 41, totalPages: 1 });
  });
});

describe("lotes GET", () => {
  it("honours the ALL sentinel on status and keeps the day expansion", async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.lot.count.mockResolvedValue(0);

    await getLotes(req("/api/lotes?status=ALL&date=2026-08-29"));

    const where = firstCallArg(prisma.lot.findMany).where as Record<string, unknown>;
    expect("estatus" in where).toBe(false);
    expect(Object.keys(where)).toEqual(["fechaEnvio"]);

    vi.clearAllMocks();
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.lot.count.mockResolvedValue(0);
    await getLotes(req("/api/lotes?status=ENVIADO"));
    expect(firstCallArg(prisma.lot.findMany).where).toEqual({ estatus: "ENVIADO" });
  });

  it("uses 20/100 page sizes and returns lots with computed stats", async () => {
    prisma.lot.findMany.mockResolvedValue([
      // `recibida` / `retornada` are String columns on `Lot`, read through the
      // route's own `toTruthyValue` ("SI" / "YES" / "TRUE" / "1").
      { id: "lot-1", items: [{ recibida: "SI", retornada: null, card: { metadata: {} } }] },
    ]);
    prisma.lot.count.mockResolvedValue(1);

    const response = await getLotes(req("/api/lotes?pageSize=999"));
    expect(firstCallArg(prisma.lot.findMany)).toMatchObject({ skip: 0, take: 100 });

    const body = await readJson(response);
    expect(Object.keys(body)).toEqual(["lots", "pagination"]);
    const lots = body.lots as Array<{ stats: unknown }>;
    expect(lots[0].stats).toEqual({ total: 1, recibidas: 1, retornadas: 0, pendientes: 0 });
  });
});

describe("redacciones GET", () => {
  it("compiles validated enums and keeps its nested item ordering", async () => {
    prisma.redaction.findMany.mockResolvedValue([]);
    prisma.redaction.count.mockResolvedValue(0);

    await getRedacciones(req("/api/redacciones?status=BORRADOR&tipo=ALL"));

    const args = firstCallArg(prisma.redaction.findMany);
    expect(args.where).toEqual({ status: "BORRADOR" });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }]);
    expect(args.include).toEqual({
      approvedBy: true,
      items: {
        include: { card: { include: { customer: true } } },
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    });
    expect(args).toMatchObject({ skip: 0, take: 20 });
  });

  it("answers 400 for an unknown enum value instead of querying Prisma", async () => {
    const response = await getRedacciones(req("/api/redacciones?status=NO_EXISTE"));
    expect((response as Response).status).toBe(400);
    expect(prisma.redaction.findMany).not.toHaveBeenCalled();
  });
});

describe("mensajeros GET dual mode", () => {
  it("omits the pagination key entirely when BOTH page and pageSize are absent", async () => {
    prisma.messenger.findMany.mockResolvedValue([]);

    const response = await getMensajeros(req("/api/mensajeros?onlyActive=1"));
    const body = await readJson(response);

    expect(Object.keys(body)).toEqual(["messengers"]);
    expect("pagination" in body).toBe(false);
    expect(prisma.messenger.count).not.toHaveBeenCalled();

    const args = firstCallArg(prisma.messenger.findMany);
    expect(args.where).toEqual({ activo: true });
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
    expect(args.include).toEqual({ serviceRates: true });
  });

  it("paginates at 25/100 as soon as either param is present", async () => {
    prisma.messenger.findMany.mockResolvedValue([]);
    prisma.messenger.count.mockResolvedValue(3);

    const response = await getMensajeros(req("/api/mensajeros?page=2"));
    expect(firstCallArg(prisma.messenger.findMany)).toMatchObject({ skip: 25, take: 25 });
    const body = await readJson(response);
    expect(Object.keys(body)).toEqual(["messengers", "pagination"]);
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, total: 3, totalPages: 1 });

    vi.clearAllMocks();
    prisma.messenger.findMany.mockResolvedValue([]);
    prisma.messenger.count.mockResolvedValue(3);
    await getMensajeros(req("/api/mensajeros?pageSize=1000"));
    expect(firstCallArg(prisma.messenger.findMany)).toMatchObject({ skip: 0, take: 100 });
  });

  it("matches province case-insensitively and never treats ALL as no-filter", async () => {
    prisma.messenger.findMany.mockResolvedValue([]);

    await getMensajeros(req("/api/mensajeros?province=ALL"));
    expect(firstCallArg(prisma.messenger.findMany).where).toEqual({
      provinciaTrabajo: { equals: "ALL", mode: "insensitive" },
    });
  });

  it("ignores onlyActive=0 rather than filtering on activo:false", async () => {
    prisma.messenger.findMany.mockResolvedValue([]);
    await getMensajeros(req("/api/mensajeros?onlyActive=0"));
    expect(firstCallArg(prisma.messenger.findMany).where).toEqual({});
  });
});

describe("config/usuarios GET", () => {
  it("encodes active as the literals true/false, not 1/0", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await getConfigUsuarios(req("/api/config/usuarios?active=false"));
    expect(firstCallArg(prisma.user.findMany).where).toEqual({ active: false });

    vi.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    await getConfigUsuarios(req("/api/config/usuarios?active=0"));
    expect(firstCallArg(prisma.user.findMany).where).toEqual({});
  });

  it("searches name/email, drops an unknown role and returns currentUserId", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    const response = await getConfigUsuarios(
      req("/api/config/usuarios?q=ana&role=NO_EXISTE&pageSize=999"),
    );

    const args = firstCallArg(prisma.user.findMany);
    expect(args.where).toEqual({
      OR: [
        { name: { contains: "ana", mode: "insensitive" } },
        { email: { contains: "ana", mode: "insensitive" } },
      ],
    });
    expect(args.orderBy).toEqual([{ active: "desc" }, { name: "asc" }, { createdAt: "asc" }]);
    expect(args).toMatchObject({ skip: 0, take: 100 });
    expect(args.select).toBeTypeOf("object");
    expect(args.include).toBeUndefined();

    const body = await readJson(response);
    expect(Object.keys(body)).toEqual(["users", "currentUserId", "pagination"]);
    expect(body.currentUserId).toBe("current-user-1");
  });
});

describe("config/usuarios/[id]/actividad GET", () => {
  const params = () => Promise.resolve({ id: "target-user-9" });

  it("keeps the mandatory authorization OR first and intact", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await getActividad(req("/api/config/usuarios/x/actividad?action=LOGIN&result=OK"), {
      params: params(),
    });

    const where = firstCallArg(prisma.auditLog.findMany).where as Record<string, unknown>;
    expect(Object.keys(where)).toEqual(["OR", "action", "result"]);
    expect(where.OR).toEqual([{ userId: "target-user-9" }, { targetUserId: "target-user-9" }]);
    expect(where.action).toBe("LOGIN");
    expect(firstCallArg(prisma.auditLog.findMany)).toMatchObject({ skip: 0, take: 25 });
  });

  it("has no ALL sentinel: ALL is applied as a literal value", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await getActividad(req("/api/config/usuarios/x/actividad?action=ALL"), { params: params() });
    const where = firstCallArg(prisma.auditLog.findMany).where as Record<string, unknown>;
    expect(where.action).toBe("ALL");
  });

  it("applies LOCAL day boundaries for from/to, not UTC", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await getActividad(req("/api/config/usuarios/x/actividad?from=2026-08-01&to=2026-08-31"), {
      params: params(),
    });

    const where = firstCallArg(prisma.auditLog.findMany).where as {
      createdAt: { gte: Date; lte: Date };
    };
    const { gte, lte } = where.createdAt;
    expect([gte.getFullYear(), gte.getMonth(), gte.getDate()]).toEqual([2026, 7, 1]);
    expect([gte.getHours(), gte.getMinutes(), gte.getSeconds()]).toEqual([0, 0, 0]);
    expect([lte.getFullYear(), lte.getMonth(), lte.getDate()]).toEqual([2026, 7, 31]);
    expect([lte.getHours(), lte.getMinutes(), lte.getSeconds()]).toEqual([23, 59, 59]);
    expect(lte.getMilliseconds()).toBe(999);
  });

  it("clamps pageSize to a max of 100", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    await getActividad(req("/api/config/usuarios/x/actividad?pageSize=999"), { params: params() });
    expect(firstCallArg(prisma.auditLog.findMany)).toMatchObject({ take: 100 });
  });
});

describe("status-digitales/bizcochitos GET", () => {
  it("runs its batch count with NO where and paginates at 15/50", async () => {
    prisma.bizcochitoBatch.findMany.mockResolvedValue([]);
    prisma.bizcochitoBatch.count.mockResolvedValue(7);
    prisma.bizcochitoBatch.findFirst.mockResolvedValue(null);
    prisma.card.count.mockResolvedValue(2);

    const response = await getBizcochitos(req("/api/status-digitales/bizcochitos?pageSize=999"));

    expect(prisma.bizcochitoBatch.count).toHaveBeenCalledWith();
    const args = firstCallArg(prisma.bizcochitoBatch.findMany);
    expect(args.where).toBeUndefined();
    expect(args.orderBy).toEqual([{ generatedAt: "desc" }, { sequence: "desc" }]);
    expect(args).toMatchObject({ skip: 0, take: 50 });

    // The pendingCount query IS filtered, and must stay so. SDD
    // contrato-tarjetas-pistoleo widens `status` to a membership check
    // (`DIGITAL_DELIVERY_STATUSES`) so ENTREGA_DIGITAL_SIN_CONTRATO cards are
    // counted as pending too.
    expect(firstCallArg(prisma.card.count).where).toEqual({
      status: { in: expect.arrayContaining(["ENTREGA_DIGITAL", "ENTREGA_DIGITAL_SIN_CONTRATO"]) },
      bizcochito: false,
      digitalDeliveryCycle: { gt: 0 },
    });

    const body = await readJson(response);
    expect(Object.keys(body)).toEqual(["pendingCount", "latest", "batches", "pagination"]);
    expect(body.pagination).toEqual({ page: 1, pageSize: 50, total: 7, totalPages: 1 });
  });

  it("defaults to pageSize 15", async () => {
    prisma.bizcochitoBatch.findMany.mockResolvedValue([]);
    prisma.bizcochitoBatch.count.mockResolvedValue(0);
    prisma.bizcochitoBatch.findFirst.mockResolvedValue(null);
    prisma.card.count.mockResolvedValue(0);

    await getBizcochitos(req("/api/status-digitales/bizcochitos"));
    expect(firstCallArg(prisma.bizcochitoBatch.findMany)).toMatchObject({ skip: 0, take: 15 });
  });
});
