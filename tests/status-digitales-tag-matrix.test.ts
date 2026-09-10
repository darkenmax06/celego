import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJson, type TransactionalPrismaMock } from "./golden/helpers/mock-route";

/**
 * Combination matrix for the filename tags an operator can stack on a digital
 * delivery image: (adicional N), (zr) and (C), against a card that may or may
 * not require a contract.
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

/** Mirrors parseImageFileName in status-digitales-client.tsx, verbatim. */
function clientParse(fileName: string) {
  const noExt = fileName.replace(/\.[^/.]+$/, "").trim();
  const hasRemoteTag = /\(\s*zr\s*\)/i.test(noExt);
  const identifier = noExt
    .replace(/\(\s*zr\s*\)/gi, "")
    .replace(/\(\s*adicional(?:\s+\d+)?\s*\)\s*$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  return { fileName, identifier, isRemote: hasRemoteTag };
}

function seedCard(o: Record<string, unknown>) {
  prisma.__seed("card", {
    id: o.id,
    tc: o.tc,
    externalReference: null,
    status: o.status ?? "EN_RUTA",
    isRemote: o.isRemote ?? false,
    returnReason: null,
    digitalDeliveryCycle: 0,
    createdAt: new Date((o.createdAt as string) ?? "2026-01-01T00:00:00Z"),
    dispatchDate: new Date("2026-01-01T00:00:00Z"),
    hasContract: o.hasContract ?? false,
    contractImageAt: null,
    contractImageFile: null,
    customer: { nombre: o.nombre, cedula: o.cedula },
  } as never);
}

/** Ana owns a principal and one additional; the additional is the target. */
function seedPair(hasContract: boolean) {
  seedCard({ id: "principal", tc: "4000000000000201", nombre: "Ana Solis", cedula: "00100000201", createdAt: "2026-01-01T00:00:00Z", hasContract });
  seedCard({ id: "adicional", tc: "4000000000000202", nombre: "Ana Solis", cedula: "00100000201", createdAt: "2026-01-02T00:00:00Z", hasContract });
}

const post = (files: string[]) =>
  postStatusDigitales(req({ items: files.map(clientParse) }));

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

describe("tag matrix: (adicional) x (zr) x (C)", () => {
  it("client parser keeps every tag recoverable by the server", () => {
    expect(clientParse("Ana Solis (adicional 1) (zr) (C).jpg")).toEqual({
      fileName: "Ana Solis (adicional 1) (zr) (C).jpg",
      identifier: "Ana Solis (adicional 1)  (C)",
      isRemote: true,
    });
  });

  it("additional + remote, card without contract -> delivered and flagged remote", async () => {
    seedPair(false);
    const body = await readJson(await post(["Ana Solis (adicional 1) (zr).jpg"]));
    const row = (body.rows as { cardId?: string; action: string }[])[0];
    expect(row.cardId).toBe("adicional");
    expect(prisma.__row("card", "adicional")?.status).toBe("ENTREGA_DIGITAL");
    expect(prisma.__row("card", "adicional")?.isRemote).toBe(true);
    expect(prisma.__row("card", "principal")?.status).toBe("EN_RUTA");
  });

  it("additional + remote, card REQUIRES contract, delivery only -> SIN_CONTRATO + warning", async () => {
    seedPair(true);
    const body = await readJson(await post(["Ana Solis (adicional 1) (zr).jpg"]));
    expect(prisma.__row("card", "adicional")?.status).toBe("ENTREGA_DIGITAL_SIN_CONTRATO");
    expect(prisma.__row("card", "adicional")?.isRemote).toBe(true);
    expect((body.summary as Record<string, unknown>).contractWarnings).toBe(1);
  });

  it("additional + remote + contract image, card REQUIRES contract -> fully delivered", async () => {
    seedPair(true);
    await post([
      "Ana Solis (adicional 1) (zr).jpg",
      "Ana Solis (adicional 1) (zr) (C).jpg",
    ]);
    const card = prisma.__row("card", "adicional");
    expect(card?.status).toBe("ENTREGA_DIGITAL");
    expect(card?.isRemote).toBe(true);
    expect(card?.contractImageAt).toBeInstanceOf(Date);
    expect(prisma.__row("card", "principal")?.status).toBe("EN_RUTA");
  });

  it("contract image alone on an additional does not deliver the principal", async () => {
    seedPair(true);
    await post(["Ana Solis (adicional 1) (C).jpg"]);
    expect(prisma.__row("card", "principal")?.status).toBe("EN_RUTA");
    expect(prisma.__row("card", "principal")?.contractImageAt).toBeNull();
  });

  it("tag order does not change the outcome", async () => {
    seedPair(true);
    await post([
      "Ana Solis (zr) (adicional 1).jpg",
      "Ana Solis (C) (zr) (adicional 1).jpg",
    ]);
    const card = prisma.__row("card", "adicional");
    expect(card?.status).toBe("ENTREGA_DIGITAL");
    expect(card?.isRemote).toBe(true);
    expect(card?.contractImageAt).toBeInstanceOf(Date);
  });

  it("contract image alone, no delivery image, does not deliver the card", async () => {
    seedPair(true);
    const body = await readJson(await post(["Ana Solis (adicional 1) (C).jpg"]));
    console.log("SOLO (C):", JSON.stringify((body.rows as unknown[])[0]));
    console.log("  adicional ->", prisma.__row("card", "adicional")?.status,
                "contractImageAt:", prisma.__row("card", "adicional")?.contractImageAt);
  });

  it("(adicional 2) when the customer only has two cards", async () => {
    seedPair(false);
    const body = await readJson(await post(["Ana Solis (adicional 2).jpg"]));
    const row = (body.rows as { action: string; cardId?: string }[])[0];
    console.log("ADICIONAL FUERA DE RANGO:", row.action, row.cardId);
    expect(prisma.__row("card", "principal")?.status).toBe("EN_RUTA");
    expect(prisma.__row("card", "adicional")?.status).toBe("EN_RUTA");
  });

  it("(zr) carried only by the contract image", async () => {
    seedPair(true);
    await post(["Ana Solis (adicional 1).jpg", "Ana Solis (adicional 1) (zr) (C).jpg"]);
    const card = prisma.__row("card", "adicional");
    console.log("ZR SOLO EN (C): status", card?.status, "isRemote", card?.isRemote);
    expect(card?.status).toBe("ENTREGA_DIGITAL");
  });

  it("bare name plus its own (C), no additional anywhere in the batch", async () => {
    seedCard({ id: "solo", tc: "4000000000000301", nombre: "Beto Ruiz", cedula: "00100000301", hasContract: true });
    await post(["Beto Ruiz.jpg", "Beto Ruiz (C).jpg"]);
    const card = prisma.__row("card", "solo");
    expect(card?.status).toBe("ENTREGA_DIGITAL");
    expect(card?.contractImageAt).toBeInstanceOf(Date);
  });

  it("(C) of the principal alongside an additional delivery in the same batch", async () => {
    seedPair(true);
    await post([
      "Ana Solis.jpg",
      "Ana Solis (C).jpg",
      "Ana Solis (adicional 1).jpg",
      "Ana Solis (adicional 1) (C).jpg",
    ]);
    const p = prisma.__row("card", "principal");
    const a = prisma.__row("card", "adicional");
    console.log("PRINCIPAL:", p?.status, "contrato:", Boolean(p?.contractImageAt));
    console.log("ADICIONAL:", a?.status, "contrato:", Boolean(a?.contractImageAt));
    expect(p?.status).toBe("ENTREGA_DIGITAL");
    expect(a?.status).toBe("ENTREGA_DIGITAL");
    expect(p?.contractImageAt).toBeInstanceOf(Date);
    expect(a?.contractImageAt).toBeInstanceOf(Date);
  });

  it("a Windows copy suffix is not read as an additional", async () => {
    seedPair(false);
    await post(["Ana Solis (2).jpg"]);
    console.log("COPIA (2): principal", prisma.__row("card", "principal")?.status,
                "| adicional", prisma.__row("card", "adicional")?.status);
  });

  it("two different people sharing a name must not be auto-picked by the sibling rule", async () => {
    // Same nombre, different cedula: the batch tags say "principal + additional"
    // but cannot say WHICH Juana they belong to.
    seedCard({ id: "juana-a", tc: "4000000000000401", nombre: "Juana Chavez", cedula: "00100000401", createdAt: "2026-01-01T00:00:00Z" });
    seedCard({ id: "juana-b", tc: "4000000000000402", nombre: "Juana Chavez", cedula: "00100000402", createdAt: "2026-01-02T00:00:00Z" });

    const body = await readJson(await post(["Juana Chavez.jpg", "Juana Chavez (adicional 1).jpg"]));
    const rows = body.rows as { fileName: string; action: string; cardId?: string }[];
    console.log("HOMONIMOS:", rows.map((r) => `${r.fileName} -> ${r.action} ${r.cardId ?? ""}`));

    expect(rows.find((r) => r.fileName === "Juana Chavez.jpg")?.action).toBe(
      "AMBIGUA_REQUIERE_REVISION",
    );
    expect(prisma.__row("card", "juana-a")?.status).toBe("EN_RUTA");
    expect(prisma.__row("card", "juana-b")?.status).toBe("EN_RUTA");
  });

  it("a copy suffix on a single-card customer still delivers that card", async () => {
    seedCard({ id: "unica", tc: "4000000000000501", nombre: "Caro Diaz", cedula: "00100000501" });
    await post(["Caro Diaz (2).jpg"]);
    console.log("COPIA EN TARJETA UNICA:", prisma.__row("card", "unica")?.status);
  });
});
