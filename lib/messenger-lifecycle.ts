import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

/** Thrown inside a write transaction when the target messenger is archived or gone. */
export const MESSENGER_ARCHIVED = "MESSENGER_ARCHIVED";

/** Archived-messenger response shared by the card-assignment paths. */
export function archivedMessengerResponse() {
  return NextResponse.json({ error: MESSENGER_ARCHIVED_MESSAGE }, { status: 409 });
}

/**
 * In-transaction guard for assignment writes: throws MESSENGER_ARCHIVED unless
 * the messenger exists and is active, so the check commits with the write.
 */
export async function assertMessengerActive(db: Db, messengerId: string) {
  const messenger = await db.messenger.findUnique({
    where: { id: messengerId },
    select: { activo: true },
  });
  if (!messenger?.activo) throw new Error(MESSENGER_ARCHIVED);
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

export type HistoryCounts = Record<string, number>;

export type DeleteResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "history"; counts: HistoryCounts }
  | { status: "concurrent" };

const DELETE_MAX_ATTEMPTS = 3;

/** Blocking history: any row here means the messenger must be archived, not deleted. */
async function countHistory(tx: Prisma.TransactionClient, messengerId: string): Promise<HistoryCounts> {
  const where = { messengerId };
  const names = [
    "routes",
    "reassignmentsTo",
    "mobilePackages",
    "secureEvidences",
    "dailyRecords",
    "reports",
    "loans",
    "payments",
    "deliveryCredits",
    "payrollPeriods",
    "payrollLocks",
    "payrollPendingChanges",
  ] as const;
  const values = await Promise.all([
    tx.route.count({ where }),
    tx.cardDeliveryReassignment.count({ where: { toMessengerId: messengerId } }),
    tx.mobileRoutePackage.count({ where }),
    tx.secureEvidence.count({ where }),
    tx.messengerDailyRecord.count({ where }),
    tx.messengerReport.count({ where }),
    tx.loan.count({ where }),
    tx.messengerPayment.count({ where }),
    tx.messengerDeliveryCredit.count({ where }),
    tx.payrollPeriod.count({ where }),
    tx.payrollPeriodLock.count({ where }),
    // No FK: a pending change would silently outlive the messenger.
    tx.payrollPendingChange.count({ where }),
  ]);
  const entries = names.map((name, index) => [name, values[index]] as const);
  return Object.fromEntries(entries.filter(([, count]) => count > 0));
}

/**
 * Hard delete, allowed for active or archived messengers with no blocking
 * history. The row lock serializes concurrent child inserts (FK inserts take
 * KEY SHARE on the parent), so the count and the delete see one state. Lock
 * contention (P2034) is retried, then reported as concurrency, never as history.
 */
export async function deleteMessenger(
  messengerId: string,
  actor: MessengerActor,
  request?: Request,
): Promise<DeleteResult> {
  for (let attempt = 1; attempt <= DELETE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<DeleteResult> => {
          const locked = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Messenger" WHERE id = ${messengerId} FOR UPDATE`;
          if (!locked.length) return { status: "not_found" };

          const counts = await countHistory(tx, messengerId);
          if (Object.keys(counts).length) return { status: "history", counts };

          const messenger = await tx.messenger.findUnique({
            where: { id: messengerId },
            select: { nombre: true },
          });
          await tx.messenger.delete({ where: { id: messengerId } });
          await writeAuditEvent(
            {
              entity: "MESSENGER",
              entityId: messengerId,
              action: "DELETE",
              userId: actor.id ?? null,
              actorEmail: actor.email ?? null,
              details: { nombre: messenger?.nombre ?? null },
              request,
            },
            tx,
          );
          return { status: "deleted" };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      if (error.code === "P2003") return { status: "history", counts: {} };
      if (error.code !== "P2034") throw error;
      if (attempt === DELETE_MAX_ATTEMPTS) return { status: "concurrent" };
    }
  }
  return { status: "concurrent" };
}
