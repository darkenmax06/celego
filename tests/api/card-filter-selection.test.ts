import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Select all matching" bulk actions resolve their cards server-side with the
 * `/tarjetas` list query, so the affected set is exactly what the list shows.
 * Pins: same params -> same `where` as `GET /api/tarjetas`; pagination never
 * narrows the set; the 20,000 cap; batched group inserts; role checks kept.
 */
const { prismaMock, requireApiSessionMock } = vi.hoisted(() => ({
  prismaMock: {
    card: { findMany: vi.fn(), count: vi.fn() },
    cardGroup: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    cardGroupMember: { createMany: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
  requireApiSessionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: requireApiSessionMock }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn(async () => undefined) }));

import { NextRequest } from "next/server";
import { GET as listTarjetas } from "@/app/api/tarjetas/route";
import { POST as rawCreateGroup } from "@/app/api/card-groups/route";
import { PATCH as rawPatchGroup } from "@/app/api/card-groups/[id]/route";
import { POST as rawExportSelection } from "@/app/api/tarjetas/exportar-seleccion/route";
import {
  FILTER_SELECTION_TOO_LARGE_MESSAGE,
  MAX_FILTER_SELECTION,
  resolveCardFilterSelectionIds,
} from "@/lib/cards/card-filter-selection";

// Route handlers are typed as possibly returning undefined; every path here returns a Response.
const createGroup = async (...args: Parameters<typeof rawCreateGroup>) => (await rawCreateGroup(...args)) as Response;
const patchGroup = async (...args: Parameters<typeof rawPatchGroup>) => (await rawPatchGroup(...args)) as Response;
const exportSelection = async (...args: Parameters<typeof rawExportSelection>) =>
  (await rawExportSelection(...args)) as Response;

let currentRole = "OPERADOR";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const idRows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `card-${index + 1}` }));

const FILTERS = {
  q: "8095551234",
  status: "EN_RUTA",
  provincia: "SANTIAGO,LA VEGA",
  contactoEstado: "CONTACTADA",
  "date.createdAt.from": "2026-10-01",
};

beforeEach(() => {
  vi.clearAllMocks();
  currentRole = "OPERADOR";
  requireApiSessionMock.mockImplementation(async (allowedRoles: string[]) =>
    allowedRoles.includes(currentRole)
      ? { session: { user: { id: "user-1", role: currentRole } } }
      : { error: new Response(null, { status: 403 }) },
  );
  prismaMock.$queryRaw.mockResolvedValue([{ id: "customer-1" }]);
  prismaMock.card.findMany.mockResolvedValue([]);
  prismaMock.card.count.mockResolvedValue(0);
  prismaMock.cardGroup.create.mockImplementation(async ({ data }: { data: { name: string } }) => ({
    id: "group-new",
    name: data.name,
  }));
  prismaMock.cardGroup.findUnique.mockResolvedValue({ id: "group-1", name: "Grupo A" });
  prismaMock.cardGroupMember.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
});

describe("resolveCardFilterSelectionIds", () => {
  it("uses the same where (and order) as GET /api/tarjetas for the same filters", async () => {
    await listTarjetas(new NextRequest(`http://localhost/api/tarjetas?${new URLSearchParams(FILTERS)}`));
    const listCall = prismaMock.card.findMany.mock.calls[0][0];

    prismaMock.card.findMany.mockResolvedValueOnce(idRows(3));
    const ids = await resolveCardFilterSelectionIds({
      mode: "filter",
      query: { ...FILTERS, page: "7", pageSize: "50" },
    });
    const selectionCall = prismaMock.card.findMany.mock.calls[1][0];

    expect(ids).toEqual(["card-1", "card-2", "card-3"]);
    expect(selectionCall.where).toEqual(listCall.where);
    expect(selectionCall.orderBy).toEqual(listCall.orderBy);
    // Pagination never narrows an "all matching" selection.
    expect(selectionCall.skip).toBeUndefined();
    expect(selectionCall.take).toBe(MAX_FILTER_SELECTION + 1);
    // The list where really carries the filters (not a vacuous comparison).
    expect(JSON.stringify(listCall.where)).toContain("SANTIAGO");
    expect(JSON.stringify(listCall.where)).toContain("customer-1");
  });

  it("rejects a selection above the cap", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce(idRows(4));
    await expect(resolveCardFilterSelectionIds({ mode: "filter", query: {} }, 3)).rejects.toThrow(
      FILTER_SELECTION_TOO_LARGE_MESSAGE,
    );
  });

  it("surfaces an invalid filter as a 400-class selection error", async () => {
    await expect(
      resolveCardFilterSelectionIds({ mode: "filter", query: { origin: "NOPE" } }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("POST /api/card-groups with a filter selection", () => {
  it("creates the group and inserts every matching card in batches", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce(idRows(2500));

    const res = await createGroup(
      jsonRequest({ name: "Todas Santiago", selection: { mode: "filter", query: { provincia: "SANTIAGO" } } }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ added: 2500, alreadyMember: 0 });
    const batches = prismaMock.cardGroupMember.createMany.mock.calls.map(([args]) => args.data.length);
    expect(batches).toEqual([1000, 1000, 500]);
    expect(prismaMock.cardGroupMember.createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
    expect(prismaMock.cardGroupMember.createMany.mock.calls[0][0].data[0]).toEqual({
      groupId: "group-new",
      cardId: "card-1",
      addedById: "user-1",
    });
  });

  it("refuses an oversized selection without creating an empty group", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce(idRows(MAX_FILTER_SELECTION + 1));

    const res = await createGroup(jsonRequest({ name: "Demasiadas", selection: { mode: "filter", query: {} } }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(FILTER_SELECTION_TOO_LARGE_MESSAGE);
    expect(prismaMock.cardGroup.create).not.toHaveBeenCalled();
  });

  it("keeps the ADMIN/OPERADOR role check", async () => {
    currentRole = "FACTURACION";
    const res = await createGroup(jsonRequest({ name: "X", selection: { mode: "filter", query: {} } }));
    expect(res.status).toBe(403);
    expect(prismaMock.card.findMany).not.toHaveBeenCalled();
  });

  it("rejects ids and a filter selection together", async () => {
    const res = await createGroup(
      jsonRequest({ name: "X", cardIds: ["card-1"], selection: { mode: "filter", query: {} } }),
    );
    expect(res.status).toBe(400);
  });

  it("keeps the id-based mode unchanged", async () => {
    const res = await createGroup(jsonRequest({ name: "Por ids", cardIds: ["a", "b"] }));
    expect(res.status).toBe(201);
    expect(prismaMock.card.findMany).not.toHaveBeenCalled();
    expect(prismaMock.cardGroupMember.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/card-groups/[id] with addSelection", () => {
  const params = { params: Promise.resolve({ id: "group-1" }) };

  it("adds every matching card in batches and reports already-members", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce(idRows(1500));
    prismaMock.cardGroupMember.createMany
      .mockResolvedValueOnce({ count: 900 })
      .mockResolvedValueOnce({ count: 500 });

    const res = await patchGroup(
      jsonRequest({ addSelection: { mode: "filter", query: { status: "EN_RUTA" } } }),
      params,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ added: 1400, alreadyMember: 100 });
    expect(prismaMock.cardGroupMember.createMany).toHaveBeenCalledTimes(2);
  });

  it("refuses an oversized selection without writing", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce(idRows(MAX_FILTER_SELECTION + 1));
    const res = await patchGroup(jsonRequest({ addSelection: { mode: "filter", query: {} } }), params);
    expect(res.status).toBe(400);
    expect(prismaMock.cardGroupMember.createMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/tarjetas/exportar-seleccion with a filter selection", () => {
  const exportableCard = {
    id: "card-1",
    tc: "4000000000000001",
    requestNumber: null,
    externalReference: null,
    productType: "CREDITO",
    status: "EN_RUTA",
    provincia: "SANTIAGO",
    zona: "Norte",
    isRemote: false,
    isAdditional: false,
    additionalIndex: 0,
    urgent: false,
    dispatchOrigin: null,
    returnReason: null,
    customer: { nombre: "Cliente", cedula: "001", telefonosRaw: null, direccionRaw: null },
    currentMessenger: null,
  };

  it("exports the cards resolved with the list where builder", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce([exportableCard]);

    const res = await exportSelection(
      jsonRequest({ selection: { mode: "filter", query: { provincia: "SANTIAGO" } }, fields: ["tc"], format: "csv" }),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("4000000000000001");
    const call = prismaMock.card.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.where)).toContain("SANTIAGO");
    expect(call.where).not.toHaveProperty("id");
    expect(call.take).toBe(MAX_FILTER_SELECTION + 1);
  });

  it("refuses an export above the cap", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce(
      Array.from({ length: MAX_FILTER_SELECTION + 1 }, () => exportableCard),
    );
    const res = await exportSelection(
      jsonRequest({ selection: { mode: "filter", query: {} }, fields: ["tc"], format: "csv" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(FILTER_SELECTION_TOO_LARGE_MESSAGE);
  });

  it("keeps the id-based export unchanged", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce([exportableCard]);
    const res = await exportSelection(jsonRequest({ cardIds: ["card-1"], fields: ["tc"], format: "csv" }));
    expect(res.status).toBe(200);
    expect(prismaMock.card.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["card-1"] } });
  });

  it("keeps the ADMIN/OPERADOR role check", async () => {
    currentRole = "MENSAJERO";
    const res = await exportSelection(
      jsonRequest({ selection: { mode: "filter", query: {} }, fields: ["tc"], format: "csv" }),
    );
    expect(res.status).toBe(403);
  });
});
