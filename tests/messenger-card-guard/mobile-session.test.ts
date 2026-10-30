import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { TransactionalPrismaMock } from "../golden/helpers/mock-route";
import { readJson } from "../golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

vi.mock("@/lib/mobile-auth", () => ({ verifyMobileToken: vi.fn() }));

import { prisma as prismaImport } from "@/lib/prisma";
import { verifyMobileToken } from "@/lib/mobile-auth";
import { requireMobileSession } from "@/lib/mobile-session";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const MESSENGER = "cmessenger0001";

function session(role: "MENSAJERO" | "ADMIN" | "OPERADOR", messengerId: string | null) {
  prisma.__seed("user", { id: "u1", email: "u@x.com", name: "U", role, active: true });
  vi.mocked(verifyMobileToken).mockReturnValue({
    uid: "u1",
    role,
    email: "u@x.com",
    messengerId,
    exp: 9999999999,
  } as never);
  return requireMobileSession(
    new NextRequest("http://localhost/x", { headers: { authorization: "Bearer t" } }),
  );
}

beforeEach(() => prisma.__reset());

describe("requireMobileSession messenger recheck (R5.7)", () => {
  it("rejects a MENSAJERO whose messenger is archived, then accepts after restore", async () => {
    prisma.__seed("messenger", { id: MESSENGER, activo: false });
    const rejected = await session("MENSAJERO", MESSENGER);
    expect("error" in rejected).toBe(true);
    if ("error" in rejected && rejected.error) {
      expect(rejected.error.status).toBe(401);
      expect(await readJson(rejected.error)).toEqual({ error: "Mensajero archivado" });
    }

    prisma.__seed("messenger", { id: MESSENGER, activo: true });
    expect("session" in (await session("MENSAJERO", MESSENGER))).toBe(true);
  });

  it("rejects a MENSAJERO whose messenger row is missing", async () => {
    const result = await session("MENSAJERO", MESSENGER);
    expect("error" in result && result.error?.status).toBe(401);
  });

  it.each(["ADMIN", "OPERADOR"] as const)(
    "does not reject a %s token carrying an archived messengerId",
    async (role) => {
      prisma.__seed("messenger", { id: MESSENGER, activo: false });
      expect("session" in (await session(role, MESSENGER))).toBe(true);
    },
  );

  it("does not look up a messenger when the MENSAJERO token carries none", async () => {
    expect("session" in (await session("MENSAJERO", null))).toBe(true);
    expect(prisma.messenger.findUnique).not.toHaveBeenCalled();
  });
});
