import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaMock, firstCallArg, readJson } from "./helpers/mock-route";

/**
 * Task 16.7 — handler-level goldens for the two routes Phase 10 deliberately did
 * NOT migrate (tasks 10.1 and 10.7).
 *
 * These pin TODAY'S behaviour so the divergences recorded in the descriptors are
 * proven by execution rather than asserted from source, and so any later attempt
 * at 10.1 / 10.7 has to keep them green or declare the change.
 */

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/mock-route");
  return { prisma: createPrismaMock() };
});

vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("./helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

vi.mock("@/lib/urgent-alerts", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, emitDueUrgentNotifications: vi.fn(async () => undefined) };
});

import { prisma as prismaImport } from "@/lib/prisma";
import { GET as getTarjetas } from "@/app/api/tarjetas/route";
import { GET as getOperativoContacto } from "@/app/api/operativo/contacto/route";

const prisma = prismaImport as unknown as ReturnType<typeof createPrismaMock>;

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tarjetas GET (task 10.1 deferred)", () => {
  beforeEach(() => {
    prisma.card.findMany.mockResolvedValue([]);
    prisma.card.count.mockResolvedValue(0);
  });

  it("COERCES a legacy status spelling instead of rejecting it", async () => {
    // Divergence 1 recorded in descriptors/tarjetas.ts: `toCardStatus` maps
    // alias spellings onto a CardStatus. An enum whitelist would 400 exactly
    // these inputs, so a naive migration would break real callers.
    await getTarjetas(req("/api/tarjetas?status=acuse-recibido"));
    expect(firstCallArg(prisma.card.findMany).where).toEqual({ status: "ACUSE_RECIBIDO" });
  });

  it("falls back to DESPACHADA for an unknown status rather than erroring", async () => {
    await getTarjetas(req("/api/tarjetas?status=NO_EXISTE"));
    expect(firstCallArg(prisma.card.findMany).where).toEqual({ status: "DESPACHADA" });
  });

  it("applies `to` as LOCAL midnight, not end of day", async () => {
    // Divergence 2: `parseISO("2026-08-31")` is local midnight and the route
    // uses it verbatim as `lte`, so the whole final day is EXCLUDED. Neither
    // `utcDay` nor `localDay` in compile() reproduces that bound.
    await getTarjetas(req("/api/tarjetas?from=2026-08-01&to=2026-08-31"));
    const { gte, lte } = (firstCallArg(prisma.card.findMany).where as {
      dispatchDate: { gte: Date; lte: Date };
    }).dispatchDate;
    expect([gte.getFullYear(), gte.getMonth(), gte.getDate()]).toEqual([2026, 7, 1]);
    expect([gte.getHours(), gte.getMinutes(), gte.getSeconds()]).toEqual([0, 0, 0]);
    expect([lte.getFullYear(), lte.getMonth(), lte.getDate()]).toEqual([2026, 7, 31]);
    expect([lte.getHours(), lte.getMinutes(), lte.getSeconds(), lte.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("treats urgent=0 as absent but honours both remote tokens", async () => {
    await getTarjetas(req("/api/tarjetas?urgent=0&remote=0"));
    expect(firstCallArg(prisma.card.findMany).where).toEqual({ isRemote: false });

    vi.clearAllMocks();
    prisma.card.findMany.mockResolvedValue([]);
    prisma.card.count.mockResolvedValue(0);
    await getTarjetas(req("/api/tarjetas?urgent=1&remote=1"));
    expect(firstCallArg(prisma.card.findMany).where).toEqual({ urgent: true, isRemote: true });
  });

  it("paginates at 25 default / 200 max and keeps its urgentCases include", async () => {
    await getTarjetas(req("/api/tarjetas"));
    const args = firstCallArg(prisma.card.findMany);
    expect(args).toMatchObject({ skip: 0, take: 25 });
    expect(args.orderBy).toEqual([{ updatedAt: "desc" }]);
    expect(args.include).toEqual({
      customer: true,
      currentMessenger: true,
      urgentCases: {
        where: { resolvedAt: null },
        orderBy: [{ level: "desc" }, { importedAt: "desc" }],
        take: 1,
        select: { id: true, level: true, nextNotificationAt: true, lastNotifiedAt: true },
      },
    });

    vi.clearAllMocks();
    prisma.card.findMany.mockResolvedValue([]);
    prisma.card.count.mockResolvedValue(0);
    await getTarjetas(req("/api/tarjetas?pageSize=999"));
    expect(firstCallArg(prisma.card.findMany)).toMatchObject({ take: 200 });
  });

  it("replaces urgentCases with activeUrgentCase in the response envelope", async () => {
    prisma.card.findMany.mockResolvedValue([
      { id: "card-1", tc: "TC1", urgentCases: [{ id: "uc-1", level: 2 }] },
      { id: "card-2", tc: "TC2", urgentCases: [] },
    ]);
    prisma.card.count.mockResolvedValue(2);

    const body = await readJson(await getTarjetas(req("/api/tarjetas")));
    expect(Object.keys(body)).toEqual(["cards", "pagination"]);
    const cards = body.cards as Array<Record<string, unknown>>;
    expect(cards[0].activeUrgentCase).toEqual({ id: "uc-1", level: 2 });
    expect(cards[1].activeUrgentCase).toBeNull();
    expect("urgentCases" in cards[0]).toBe(false);
    expect(body.pagination).toEqual({ page: 1, pageSize: 25, total: 2, totalPages: 1 });
  });
});

describe("operativo/contacto GET activos (task 10.7 deferred)", () => {
  beforeEach(() => {
    prisma.card.findMany.mockResolvedValue([]);
    prisma.card.count.mockResolvedValue(0);
  });

  it("composes AND around mandatory clauses that a flat where would overwrite", async () => {
    await getOperativoContacto(req("/api/operativo/contacto?q=ana&provincia=SANTIAGO"));

    const where = firstCallArg(prisma.card.findMany).where as { AND: Array<Record<string, unknown>> };
    expect(Object.keys(where)).toEqual(["AND"]);
    // The closed-status exclusion is FIRST and non-negotiable.
    expect(where.AND[0]).toEqual({
      status: {
        notIn: [
          "ENTREGADA",
          "ENTREGA_DIGITAL",
          "RETORNADA",
          "ACUSE_RECIBIDO",
          "DEVUELTA_TIENDA",
          "TD_ENTREGADO",
          "TD_DEVUELTO_NO_LOCALIZADO",
          "TD_NO_LE_INTERESA",
          "TD_RETIRADA_EN_OFICINA",
          "TD_SOLICITADA_POR_ERROR",
          "TD_ZONA_FUERA_COBERTURA",
        ],
      },
    });
    expect(where.AND[1]).toEqual({ provincia: "SANTIAGO" });
    // The search OR is a CONJUNCT, not a top-level `OR` key. compile() writes
    // the top-level `OR`, which is why spreading a flat where here is unsafe.
    expect(where.AND[2]).toEqual({
      OR: [
        { tc: { contains: "ana", mode: "insensitive" } },
        { externalReference: { contains: "ana", mode: "insensitive" } },
        { customer: { cedula: { contains: "ana", mode: "insensitive" } } },
        { customer: { nombre: { contains: "ana", mode: "insensitive" } } },
      ],
    });
    // The SLA window is the last conjunct and also uses `OR`.
    const slaClause = where.AND[3] as { OR: [{ slaDueDate: null }, { slaDueDate: { lte: Date } }] };
    expect(slaClause.OR[0]).toEqual({ slaDueDate: null });
    expect(slaClause.OR[1].slaDueDate.lte).toBeInstanceOf(Date);

    expect(firstCallArg(prisma.card.findMany).orderBy).toEqual([
      { urgent: "desc" },
      { slaDueDate: "asc" },
      { updatedAt: "desc" },
    ]);
  });

  it("short-circuits an unknown status to an EMPTY page without querying Prisma", async () => {
    // Third outcome of `parseCardStatusFilter` that no descriptor can express.
    const body = await readJson(await getOperativoContacto(req("/api/operativo/contacto?status=NO_EXISTE")));
    expect(prisma.card.findMany).not.toHaveBeenCalled();
    expect(Object.keys(body)).toEqual(["tab", "cards", "pagination"]);
    expect(body.cards).toEqual([]);
    expect(body.pagination).toEqual({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  });

  it("omits the status conjunct for ALL and paginates at 25/100", async () => {
    await getOperativoContacto(req("/api/operativo/contacto?status=ALL&provincia=ALL&pageSize=999"));
    const where = firstCallArg(prisma.card.findMany).where as { AND: unknown[] };
    expect(where.AND).toHaveLength(2); // closed-status exclusion + SLA window only
    expect(firstCallArg(prisma.card.findMany)).toMatchObject({ skip: 0, take: 100 });
  });
});
