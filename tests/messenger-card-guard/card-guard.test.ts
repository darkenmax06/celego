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

vi.mock("@/lib/card-transition", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/card-transition")>()),
  applyCardTransition: vi.fn(async () => undefined),
}));

vi.mock("@/lib/route-reassignment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/route-reassignment")>()),
  applyMessengerReassignment: vi.fn(async () => undefined),
}));

import { prisma as prismaImport } from "@/lib/prisma";
import { applyCardTransition } from "@/lib/card-transition";
import { batchUpdateCards } from "@/lib/card-service";
import { PATCH as patchCard } from "@/app/api/tarjetas/route";
import { POST as postLoteEstado } from "@/app/api/tarjetas/lote/estado/route";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const ARCHIVED = "carchived00001";
const ACTIVE = "cactive0000001";
const CARD = "ccard000000001";
const transition = vi.mocked(applyCardTransition);

const patch = (body: unknown) =>
  patchCard(
    new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }),
  ) as Promise<Response>;
const lote = (body: unknown) =>
  postLoteEstado(
    new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }),
  ) as Promise<Response>;

beforeEach(() => {
  prisma.__reset();
  transition.mockClear();
  prisma.__seed("messenger", { id: ARCHIVED, nombre: "Archivado", activo: false });
  prisma.__seed("messenger", { id: ACTIVE, nombre: "Activo", activo: true });
  prisma.__seed("card", { id: CARD, status: "DESPACHADA", currentMessengerId: ARCHIVED });
});

describe("PATCH /api/tarjetas (R5.9)", () => {
  it("rejects assigning to an archived messenger with 409 and changes nothing", async () => {
    const response = await patch({ id: CARD, messengerId: ARCHIVED });
    expect(response.status).toBe(409);
    expect(await readJson(response)).toEqual({ error: "Mensajero archivado" });
    expect(transition).not.toHaveBeenCalled();
  });

  it.each([
    ["assigning to an active messenger", { messengerId: ACTIVE }],
    ["unassigning (null)", { messengerId: null }],
    ["a status-only update", { status: "EN_RUTA" }],
  ])("allows %s", async (_label, extra) => {
    const response = await patch({ id: CARD, ...extra });
    expect(response.status).toBe(200);
    expect(transition).toHaveBeenCalledTimes(1);
  });
});

describe("batchUpdateCards (R5.9)", () => {
  it("throws MESSENGER_ARCHIVED before touching any card of the batch", async () => {
    prisma.__seed("card", { id: "ccard000000002", status: "DESPACHADA" });
    await expect(
      batchUpdateCards([CARD, "ccard000000002"], { messengerId: ARCHIVED }),
    ).rejects.toThrow("MESSENGER_ARCHIVED");
    expect(transition).not.toHaveBeenCalled();
  });

  it.each([
    ["an active messenger", { messengerId: ACTIVE }],
    ["null (unassign)", { messengerId: null }],
    ["a status-only change", { status: "EN_RUTA" as const }],
  ])("allows %s", async (_label, changes) => {
    await expect(batchUpdateCards([CARD], changes)).resolves.toEqual({ updated: 1 });
    expect(transition).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/tarjetas/lote/estado", () => {
  it("keeps its 400 pre-check for an archived messenger", async () => {
    const response = await lote({ cardIds: [CARD], messengerId: ARCHIVED });
    expect(response.status).toBe(400);
  });

  it("maps an archive that lands after the pre-check to 409", async () => {
    // Pre-check sees the messenger active; the in-transaction check sees it archived.
    prisma.messenger.findUnique.mockResolvedValueOnce({ id: ARCHIVED, activo: true });
    const response = await lote({ cardIds: [CARD], messengerId: ARCHIVED });
    expect(response.status).toBe(409);
    expect(await readJson(response)).toEqual({ error: "Mensajero archivado" });
    expect(transition).not.toHaveBeenCalled();
  });
});
