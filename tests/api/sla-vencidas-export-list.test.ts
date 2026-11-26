import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { card: { findMany: (...args: unknown[]) => findMany(...args) } } }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));
vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("../golden/helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

import { POST } from "@/app/api/sla-vencidas/export-list/route";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/sla-vencidas/export-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([
    {
      id: "c1", tc: "4-14543802672", requestNumber: "4-14543802672", productType: "DEBITO", status: "DESPACHADA",
      slaDueDate: new Date("2026-11-11T00:00:00Z"), dispatchDate: new Date("2026-11-04T00:00:00Z"),
      provincia: "Santiago", zona: "Norte", urgent: false, isAdditional: false, additionalIndex: null,
      metadata: { operativo: { solicitudRetorno: true } },
      customer: { nombre: "CECILIA", cedula: "03105761559", direccionRaw: "Calle 1", telefonosRaw: "8090000000" },
      currentMessenger: null, lastAssignedMessenger: null,
    },
  ]);
});

describe("POST /api/sla-vencidas/export-list", () => {
  it("accepts the list view's columns (tc, adicional, contactoEstado) instead of rejecting the payload", async () => {
    const res = (await post({
      params: "productType=DEBITO&date.slaDueDate.from=2026-11-17&page=3&pageSize=50",
      columns: ["nombre", "tc", "cedula", "contactoEstado", "adicional", "status"],
      format: "csv",
    }))!;
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("TC");
    expect(csv).toContain("Retorno solicitado");
    expect(csv).toContain("PRINCIPAL");
  });

  it("applies the list filters (product) and exports every page", async () => {
    await post({ params: "productType=DEBITO&page=3&pageSize=50", columns: ["nombre"], format: "csv" });
    const args = findMany.mock.calls[0][0] as { where: unknown; skip?: number; take?: number };
    expect(JSON.stringify(args.where)).toContain("DEBITO");
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
  });
});
