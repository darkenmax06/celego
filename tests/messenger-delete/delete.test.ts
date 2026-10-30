import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RELATIONS = {
  routes: "route",
  reassignmentsTo: "cardDeliveryReassignment",
  mobilePackages: "mobileRoutePackage",
  secureEvidences: "secureEvidence",
  dailyRecords: "messengerDailyRecord",
  reports: "messengerReport",
  loans: "loan",
  payments: "messengerPayment",
  deliveryCredits: "messengerDeliveryCredit",
  payrollPeriods: "payrollPeriod",
  payrollLocks: "payrollPeriodLock",
  payrollPendingChanges: "payrollPendingChange",
} as const;

// Relations that must NOT block: their models are never counted by the guard.
const NON_BLOCKING_MODELS = [
  "messengerServiceRate",
  "mobileDevice",
  "card",
  "mobileIncident",
  "mobileSyncJob",
  "auditLog",
  "workflowDraft",
];

const db = vi.hoisted(() => {
  const counts = new Map<string, number>();
  const tx: Record<string, unknown> = {
    $queryRaw: vi.fn(async () => [{ id: "m1" }]),
    messenger: { delete: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { counts, tx, transaction: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: db.transaction },
}));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "admin-1", email: "admin@example.com", role: "ADMIN" } },
  })),
}));

import { requireApiSession } from "@/lib/api-session";
import { DELETE } from "@/app/api/mensajeros/route";

const countModels = [...Object.values(RELATIONS), ...NON_BLOCKING_MODELS];
const countFns = new Map<string, ReturnType<typeof vi.fn>>();
for (const model of countModels) {
  const fn = vi.fn(async () => db.counts.get(model) ?? 0);
  countFns.set(model, fn);
  db.tx[model] = { ...(db.tx[model] as object | undefined), count: fn };
}

function request(body: unknown = { id: "m1" }) {
  return new Request("http://localhost/api/mensajeros", { method: "DELETE", body: JSON.stringify(body) });
}
const body = async (response: Response | undefined) => (await response!.json()) as Record<string, any>;
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test" });
const audit = () => (db.tx.auditLog as { create: ReturnType<typeof vi.fn> }).create;
const remove = () => (db.tx.messenger as { delete: ReturnType<typeof vi.fn> }).delete;

beforeEach(() => {
  vi.clearAllMocks();
  db.counts.clear();
  (db.tx.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "m1" }]);
  db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db.tx));
  (db.tx.messenger as { findUnique?: unknown }).findUnique = vi.fn(async () => ({ id: "m1", nombre: "Pedro" }));
});

describe("DELETE /api/mensajeros guarded hard delete (R9)", () => {
  it.each(Object.entries(RELATIONS))("%s alone blocks with 409 TIENE_HISTORIAL", async (relation, model) => {
    db.counts.set(model, 3);
    const response = await DELETE(request());
    const payload = await body(response);
    expect(response?.status).toBe(409);
    expect(payload.code).toBe("TIENE_HISTORIAL");
    expect(payload.counts).toEqual({ [relation]: 3 });
    expect(payload.error).toContain("Archivar");
    expect(payload.error).toContain(relation);
    expect(remove()).not.toHaveBeenCalled();
    expect(audit()).not.toHaveBeenCalled();
  });

  it("does not count non-blocking relations and deletes with an audit event", async () => {
    for (const model of NON_BLOCKING_MODELS) db.counts.set(model, 9);
    const response = await DELETE(request());
    expect(response?.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true });
    for (const model of NON_BLOCKING_MODELS) expect(countFns.get(model)).not.toHaveBeenCalled();
    expect(remove()).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(audit().mock.calls[0][0].data).toMatchObject({
      entity: "MESSENGER",
      entityId: "m1",
      action: "DELETE",
      details: { nombre: "Pedro" },
    });
  });

  it("locks the row with FOR UPDATE inside a Serializable transaction", async () => {
    await DELETE(request());
    expect(db.transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    const sql = (db.tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0] as TemplateStringsArray;
    expect(sql.join("?")).toMatch(/FROM "Messenger" WHERE id = \? FOR UPDATE/);
  });

  it("is ADMIN only, 400 without id and 404 for an unknown id", async () => {
    expect(requireApiSession).not.toHaveBeenCalled();
    expect((await DELETE(request({})))?.status).toBe(400);
    expect(requireApiSession).toHaveBeenCalledWith(["ADMIN"]);
    (db.tx.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    expect((await DELETE(request()))?.status).toBe(404);
    expect(audit()).not.toHaveBeenCalled();
  });

  it("returns the auth error for non-admin sessions", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireApiSession).mockResolvedValueOnce({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as never);
    expect((await DELETE(request()))?.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("retries P2034 and succeeds on the third attempt", async () => {
    db.transaction
      .mockRejectedValueOnce(prismaError("P2034"))
      .mockRejectedValueOnce(prismaError("P2034"));
    const response = await DELETE(request());
    expect(response?.status).toBe(200);
    expect(db.transaction).toHaveBeenCalledTimes(3);
  });

  it("answers 409 CONFLICTO_CONCURRENTE once retries are exhausted", async () => {
    db.transaction.mockRejectedValue(prismaError("P2034"));
    const response = await DELETE(request());
    expect(response?.status).toBe(409);
    expect((await body(response)).code).toBe("CONFLICTO_CONCURRENTE");
    expect(db.transaction).toHaveBeenCalledTimes(3);
  });

  it("maps an FK violation (P2003) to TIENE_HISTORIAL", async () => {
    db.transaction.mockRejectedValue(prismaError("P2003"));
    const response = await DELETE(request());
    expect(response?.status).toBe(409);
    expect((await body(response)).code).toBe("TIENE_HISTORIAL");
  });
});
