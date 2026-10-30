import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { writeAuditEvent } from "@/lib/audit";
import { MOBILE_OPEN_CARD_STATUSES } from "@/lib/mobile-authorization";
import { prisma } from "@/lib/prisma";
import { ACTIVE_ROUTE_STATUSES } from "@/lib/route-reassignment";

export const MESSENGER_ARCHIVED_MESSAGE = "Mensajero archivado";

type Db = Prisma.TransactionClient | typeof prisma;

export type WorkloadCounts = {
  openRoutes: number;
  assignedCards: number;
};

export type MessengerActor = {
  id?: string | null;
  email?: string | null;
};

/** Open routes and cards still in the field for a messenger (read-only). */
export async function getWorkloadCounts(db: Db, messengerId: string): Promise<WorkloadCounts> {
  const [openRoutes, assignedCards] = await Promise.all([
    db.route.count({ where: { messengerId, status: { in: [...ACTIVE_ROUTE_STATUSES] } } }),
    db.card.count({
      where: { currentMessengerId: messengerId, status: { in: [...MOBILE_OPEN_CARD_STATUSES] } },
    }),
  ]);
  return { openRoutes, assignedCards };
}

/**
 * Guard for create/assign paths. Returns the messenger when it is active, or a
 * ready-to-return 404 (unknown) / 409 (archived) response.
 */
export async function requireActiveMessenger(db: Db, messengerId: string) {
  const messenger = await db.messenger.findUnique({ where: { id: messengerId } });
  if (!messenger) {
    return {
      error: NextResponse.json({ error: "Mensajero no encontrado" }, { status: 404 }),
    } as const;
  }
  if (!messenger.activo) {
    return {
      error: NextResponse.json({ error: MESSENGER_ARCHIVED_MESSAGE }, { status: 409 }),
    } as const;
  }
  return { messenger } as const;
}

export type SetActiveResult =
  | { found: false }
  | ({
      found: true;
      changed: boolean;
      messenger: { id: string; nombre: string; activo: boolean };
    } & WorkloadCounts);

/**
 * Archive (`activo=false`) or restore (`activo=true`) a messenger. The
 * conditional `updateMany` makes the transition race-safe and idempotent: a
 * repeat request matches nothing, writes no audit event and is reported as
 * `changed:false`. The audit event is written in the same transaction.
 */
export async function setMessengerActive(
  messengerId: string,
  target: boolean,
  actor: MessengerActor,
  request?: Request,
): Promise<SetActiveResult> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.messenger.updateMany({
      where: { id: messengerId, activo: !target },
      data: { activo: target },
    });

    const messenger = await tx.messenger.findUnique({
      where: { id: messengerId },
      select: { id: true, nombre: true, activo: true },
    });
    if (!messenger) return { found: false } as const;

    const counts = await getWorkloadCounts(tx, messengerId);
    const changed = updated.count > 0;

    if (changed) {
      await writeAuditEvent(
        {
          entity: "MESSENGER",
          entityId: messengerId,
          action: target ? "RESTORE" : "ARCHIVE",
          userId: actor.id ?? null,
          actorEmail: actor.email ?? null,
          details: { nombre: messenger.nombre, ...counts },
          request,
        },
        tx,
      );
    }

    return { found: true, changed, messenger, ...counts } as const;
  });
}
