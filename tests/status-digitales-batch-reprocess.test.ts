import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJson, type TransactionalPrismaMock } from "./golden/helpers/mock-route";

/**
 * Reproduction for the reported batch flow: ten name-based images where one
 * customer owns a principal and an additional card, resolved in two passes.
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

function seedCard(o: Record<string, unknown>) {
  prisma.__seed("card", {
    id: o.id,
    tc: o.tc,
    externalReference: null,
    status: o.status ?? "EN_RUTA",
    isRemote: false,
    returnReason: null,
    digitalDeliveryCycle: 0,
    createdAt: new Date((o.createdAt as string) ?? "2026-01-01T00:00:00Z"),
    dispatchDate: new Date("2026-01-01T00:00:00Z"),
    hasContract: false,
    contractImageAt: null,
    contractImageFile: null,
    customer: { nombre: o.nombre, cedula: o.cedula },
  } as never);
}

const OTHERS = [
  ["card-1", "4000000000000001", "Pedro Perez", "00100000001"],
  ["card-2", "4000000000000002", "Juan Perinin", "00100000002"],
  ["card-3", "4000000000000003", "Julio Mancio", "00100000003"],
  ["card-4", "4000000000000004", "David Eyraud", "00100000004"],
  ["card-5", "4000000000000005", "Ester Perez", "00100000005"],
  ["card-8", "4000000000000008", "Pedro Picapiedra", "00100000008"],
  ["card-9", "4000000000000009", "Juana Mota", "00100000009"],
  ["card-10", "4000000000000010", "Julio Mieses", "00100000010"],
];

function seedAll() {
  for (const [id, tc, nombre, cedula] of OTHERS) seedCard({ id, tc, nombre, cedula });
  // Juana Chavez owns two open cards: principal and additional.
  seedCard({ id: "card-6", tc: "4000000000000006", nombre: "Juana Chavez", cedula: "00100000006", createdAt: "2026-01-01T00:00:00Z" });
  seedCard({ id: "card-7", tc: "4000000000000007", nombre: "Juana Chavez", cedula: "00100000006", createdAt: "2026-01-02T00:00:00Z" });
}

const FILES = [
  "Pedro Perez.jpg", "Juan Perinin.jpg", "Julio Mancio.jpg", "David Eyraud.jpg",
  "Ester Perez.jpg", "Juana Chavez.jpg", "Juana Chavez (adicional).jpg",
  "Pedro Picapiedra.jpg", "Juana Mota.jpg", "Julio Mieses.jpg",
];

const items = (overrides: Record<string, string> = {}) =>
  FILES.map((fileName) => ({
    fileName,
    identifier: fileName.replace(/\.jpg$/, ""),
    isRemote: false,
    ...(overrides[fileName] ? { overrideCardId: overrides[fileName] } : {}),
  }));

type Row = { fileName: string; action: string };

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("status-digitales: ten-image batch with one additional card", () => {
  it("pairs the bare name with the principal when the batch carries the additional", async () => {
    seedAll();
    const body = await readJson(await postStatusDigitales(req({ items: items() })));
    const rows = body.rows as Row[];

    const ambiguous = rows.filter((r) => r.action === "AMBIGUA_REQUIERE_REVISION").map((r) => r.fileName);
    const notFound = rows.filter((r) => r.action === "NO_ENCONTRADA").map((r) => r.fileName);

    console.log("PASS 1 ambiguous:", ambiguous);
    console.log("PASS 1 not found:", notFound);
    console.log("PASS 1 actions:", rows.map((r) => `${r.fileName} -> ${r.action}`));

    // The batch carries the additional explicitly, so the bare name is the
    // principal and nothing should stop the operator.
    expect(ambiguous).toEqual([]);
    expect(notFound).toEqual([]);
    const byFile = new Map(rows.map((r) => [r.fileName, r]));
    expect((byFile.get("Juana Chavez.jpg") as { cardId?: string }).cardId).toBe("card-6");
    expect((byFile.get("Juana Chavez (adicional).jpg") as { cardId?: string }).cardId).toBe("card-7");
  });

  it("second pass resolving the ambiguity keeps the nine already matched", async () => {
    seedAll();
    await postStatusDigitales(req({ items: items() }));

    const body = await readJson(
      await postStatusDigitales(req({ items: items({ "Juana Chavez.jpg": "card-6" }) })),
    );
    const rows = body.rows as Row[];
    const notFound = rows.filter((r) => r.action === "NO_ENCONTRADA").map((r) => r.fileName);

    console.log("PASS 2 actions:", rows.map((r) => `${r.fileName} -> ${r.action}`));
    console.log("PASS 2 not found:", notFound);

    expect(notFound).toEqual([]);
  });

  it("keeps (adicional N) pinned to the same card after the principal is delivered", async () => {
    seedCard({ id: "p", tc: "4000000000000101", nombre: "Ana Solis", cedula: "00100000101", createdAt: "2026-01-01T00:00:00Z" });
    seedCard({ id: "a1", tc: "4000000000000102", nombre: "Ana Solis", cedula: "00100000101", createdAt: "2026-01-02T00:00:00Z" });
    seedCard({ id: "a2", tc: "4000000000000103", nombre: "Ana Solis", cedula: "00100000101", createdAt: "2026-01-03T00:00:00Z" });

    // Deliver the principal on its own first.
    await postStatusDigitales(
      req({ items: [{ fileName: "Ana Solis.jpg", identifier: "Ana Solis", isRemote: false, overrideCardId: "p" }] }),
    );
    expect(prisma.__row("card", "p")?.status).toBe("ENTREGA_DIGITAL");

    // Ranking only the open cards would slide "adicional 1" onto a2.
    const body = await readJson(
      await postStatusDigitales(
        req({ items: [{ fileName: "Ana Solis (adicional 1).jpg", identifier: "Ana Solis (adicional 1)", isRemote: false }] }),
      ),
    );
    const row = (body.rows as { cardId?: string }[])[0];
    expect(row.cardId).toBe("a1");
    expect(prisma.__row("card", "a1")?.status).toBe("ENTREGA_DIGITAL");
    expect(prisma.__row("card", "a2")?.status).toBe("EN_RUTA");
  });
});
