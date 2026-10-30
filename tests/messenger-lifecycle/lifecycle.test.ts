import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionalPrismaMock } from "../golden/helpers/mock-route";

vi.mock("@/lib/prisma", async () => {
  const { createTransactionalPrismaMock } = await import("../golden/helpers/mock-route");
  return { prisma: createTransactionalPrismaMock() };
});

import { prisma as prismaImport } from "@/lib/prisma";
import {
  getWorkloadCounts,
  requireActiveMessenger,
  setMessengerActive,
} from "@/lib/messenger-lifecycle";

const prisma = prismaImport as unknown as TransactionalPrismaMock;
const actor = { id: "user-1", email: "Admin@Example.com" };

function seedMessenger(activo: boolean) {
  prisma.__seed("messenger", { id: "m1", nombre: "Pedro", activo });
}

function auditRows() {
  return prisma.__rows("auditLog");
}

beforeEach(() => {
  prisma.__reset();
});

describe("getWorkloadCounts", () => {
  it("counts open routes and open-status cards for the messenger", async () => {
    prisma.route.count.mockResolvedValue(2);
    prisma.card.count.mockResolvedValue(15);

    await expect(getWorkloadCounts(prisma as never, "m1")).resolves.toEqual({
      openRoutes: 2,
      assignedCards: 15,
    });

    expect(prisma.route.count.mock.calls[0][0]).toEqual({
      where: { messengerId: "m1", status: { in: ["PENDIENTE", "EN_PROCESO"] } },
    });
    expect(prisma.card.count.mock.calls[0][0]).toEqual({
      where: {
        currentMessengerId: "m1",
        status: { in: ["DESPACHADA", "ENVIADA_INTERIOR", "EN_RUTA"] },
      },
    });
  });
});

describe("requireActiveMessenger", () => {
  it("returns the messenger when active", async () => {
    seedMessenger(true);
    const result = await requireActiveMessenger(prisma as never, "m1");
    expect("messenger" in result && result.messenger?.id).toBe("m1");
  });

  it("answers 409 'Mensajero archivado' when archived", async () => {
    seedMessenger(false);
    const result = await requireActiveMessenger(prisma as never, "m1");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error?.status).toBe(409);
      expect(await result.error?.json()).toEqual({ error: "Mensajero archivado" });
    }
  });

  it("answers 404 when the messenger does not exist", async () => {
    const result = await requireActiveMessenger(prisma as never, "ghost");
    expect("error" in result && result.error?.status).toBe(404);
  });
});

describe("setMessengerActive", () => {
  it("archives an active messenger, reports counts and audits in the same tx", async () => {
    seedMessenger(true);
    prisma.route.count.mockResolvedValue(2);
    prisma.card.count.mockResolvedValue(15);

    const result = await setMessengerActive("m1", false, actor);

    expect(result).toMatchObject({
      found: true,
      changed: true,
      openRoutes: 2,
      assignedCards: 15,
      messenger: { id: "m1", activo: false },
    });
    expect(prisma.__row("messenger", "m1")?.activo).toBe(false);
    expect(auditRows()).toHaveLength(1);
    expect(auditRows()[0]).toMatchObject({
      entity: "MESSENGER",
      entityId: "m1",
      action: "ARCHIVE",
      userId: "user-1",
      actorEmail: "admin@example.com",
      details: { nombre: "Pedro", openRoutes: 2, assignedCards: 15 },
    });
  });

  it("restores an archived messenger with a RESTORE audit event", async () => {
    seedMessenger(false);

    const result = await setMessengerActive("m1", true, actor);

    expect(result).toMatchObject({ found: true, changed: true, messenger: { activo: true } });
    expect(auditRows()[0]).toMatchObject({ action: "RESTORE" });
  });

  it("is an idempotent no-op without audit when already archived", async () => {
    seedMessenger(false);
    const result = await setMessengerActive("m1", false, actor);
    expect(result).toMatchObject({ found: true, changed: false });
    expect(auditRows()).toHaveLength(0);
  });

  it("is an idempotent no-op without audit when already active", async () => {
    seedMessenger(true);
    const result = await setMessengerActive("m1", true, actor);
    expect(result).toMatchObject({ found: true, changed: false });
    expect(auditRows()).toHaveLength(0);
  });

  it("reports not found without audit for an unknown id", async () => {
    await expect(setMessengerActive("ghost", false, actor)).resolves.toEqual({ found: false });
    expect(auditRows()).toHaveLength(0);
  });

  it("reports not found when the row is deleted between update and lookup", async () => {
    seedMessenger(true);
    // The conditional update matches, then the row vanishes before the lookup.
    prisma.messenger.findUnique.mockResolvedValueOnce(null);

    await expect(setMessengerActive("m1", false, actor)).resolves.toEqual({ found: false });
    expect(auditRows()).toHaveLength(0);
  });

  it("does not modify routes or cards when archiving", async () => {
    seedMessenger(true);
    await setMessengerActive("m1", false, actor);
    expect(prisma.route.updateMany).not.toHaveBeenCalled();
    expect(prisma.card.updateMany).not.toHaveBeenCalled();
    expect(prisma.mobileDevice.updateMany).not.toHaveBeenCalled();
  });
});
