import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { card: { findMany: (...args: unknown[]) => findMany(...args) } } }));
vi.mock("@/lib/api-session", async () => {
  const { createSessionMock } = await import("../golden/helpers/mock-route");
  return { requireApiSession: createSessionMock("current-user-1") };
});

import { GET } from "@/app/api/sla-vencidas/export/route";

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe("GET /api/sla-vencidas/export (JPG ZIP)", () => {
  it("uses the list's query: product filter applied and closed debit cards excluded", async () => {
    await GET(new NextRequest("http://localhost/api/sla-vencidas/export?productType=DEBITO&date.slaDueDate.from=2026-11-17"));
    const where = JSON.stringify((findMany.mock.calls[0][0] as { where: unknown }).where);
    expect(where).toContain("DEBITO");
    expect(where).toContain("TD_ENTREGADO"); // closed debit status is in the notIn list
    expect(where).toContain("2026-11-17");
  });
});
