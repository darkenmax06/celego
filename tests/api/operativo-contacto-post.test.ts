import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    card: { update: vi.fn(async () => ({})) },
    contactLog: { create: vi.fn(async () => ({ id: "log-1" })) },
  };
  const prismaMock = {
    card: { findUnique: vi.fn() },
    sLAExtensionRequest: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  };
  return { prismaMock, txMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "user-1", name: "Operador" } },
  })),
}));
vi.mock("@/lib/urgent-alerts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/urgent-alerts")>()),
  emitDueUrgentNotifications: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/operativo/contacto/route";
import {
  CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE,
  CONTACTED_CALL_PHONE_REQUIRED_MESSAGE,
} from "@/lib/contact-call-shared";

const CARD_ID = "cjld2cjxh0000qzrmn831i7rn";

function cardWith(metadata: unknown = {}, telefonosRaw = "8095551234") {
  return {
    id: CARD_ID,
    tc: "1234",
    provincia: "Santo Domingo",
    zona: "Z1",
    status: "EN_CALL_CENTER",
    productType: "CREDITO",
    returnReason: null,
    metadata,
    customer: { nombre: "Ana", cedula: "001", telefonosRaw, direccionRaw: "Calle 1" },
    currentMessenger: null,
  };
}

function post(body: Record<string, unknown>) {
  return POST({ json: async () => ({ cardId: CARD_ID, ...body }) } as never);
}

const workingPhone = { num: "8095551234", funciona: true };

describe("POST /api/operativo/contacto - contacted-call rule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.card.findUnique.mockResolvedValue(cardWith());
  });

  it("rejects explicit empty telefonos with 400 and writes nothing", async () => {
    const res = await post({ contactado: true, canalContacto: "WHATSAPP", telefonos: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.sLAExtensionRequest.create).not.toHaveBeenCalled();
  });

  it("rejects omitted telefonos when the stored previous phones do not work", async () => {
    prismaMock.card.findUnique.mockResolvedValue(
      cardWith({ operativo: { telefonos: [{ num: "8095551234", funciona: false, principal: true }] } }),
    );
    const res = await post({ contactado: true, canalContacto: "WHATSAPP" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("accepts omitted telefonos when the stored previous phones work", async () => {
    prismaMock.card.findUnique.mockResolvedValue(
      cardWith({ operativo: { telefonos: [{ num: "8095551234", funciona: true, principal: true }] } }),
    );
    const res = await post({ contactado: true, canalContacto: "WHATSAPP" });
    expect(res.status).toBe(201);
  });

  it("rejects a working phone with fewer than 7 digits", async () => {
    const res = await post({
      contactado: true,
      canalContacto: "WHATSAPP",
      telefonos: [{ num: "55512", funciona: true }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
  });

  it("rejects a missing channel after the phone check passes", async () => {
    const res = await post({ contactado: true, telefonos: [workingPhone] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE);
  });

  it("reports the phone message first when both are missing", async () => {
    const res = await post({ contactado: true, telefonos: [{ num: "8095551234", funciona: false }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
  });

  it("rejects a failing transfer before creating the SLA extension", async () => {
    const res = await post({
      contactado: true,
      trasladoProvincia: "Santiago",
      telefonos: [{ num: "8095551234", funciona: false }],
      canalContacto: "WHATSAPP",
    });
    expect(res.status).toBe(400);
    expect(prismaMock.sLAExtensionRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a failing return request (contactado true)", async () => {
    const res = await post({
      contactado: true,
      solicitudRetorno: true,
      telefonos: [workingPhone],
    });
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("accepts a valid contacted call", async () => {
    const res = await post({ contactado: true, canalContacto: "LLAMADA_DIRECTA", telefonos: [workingPhone] });
    expect(res.status).toBe(201);
    expect(txMock.contactLog.create).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid transfer and creates the SLA extension", async () => {
    const res = await post({
      contactado: true,
      canalContacto: "WHATSAPP",
      trasladoProvincia: "Santiago",
      telefonos: [workingPhone],
    });
    expect(res.status).toBe(201);
    expect(prismaMock.sLAExtensionRequest.create).toHaveBeenCalledTimes(1);
  });

  it("leaves NO_CONTACTADA validation unchanged", async () => {
    const res = await post({
      contactado: false,
      telefonos: [{ num: "8095551234", funciona: false }],
      telefonosDetalle: [{ numero: "8095551234", estado: "NO_CONTESTA" }],
    });
    expect(res.status).toBe(201);
  });
});
