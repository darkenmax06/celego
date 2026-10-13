import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { applyPendingChanges } from "@/lib/payroll/counting";
import { PayrollError, closePayment, refreshPaymentTotals, reopenPayment } from "@/lib/payroll/payments";
import { periodsOverlap, toPayrollDay } from "@/lib/payroll/period";

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  from: z.string(),
  to: z.string(),
  messengerId: z.string().cuid().nullable().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("LOCK"), periodId: z.string().cuid(), messengerId: z.string().cuid() }),
  z.object({ action: z.literal("UNLOCK"), periodId: z.string().cuid(), messengerId: z.string().cuid() }),
  z.object({ action: z.literal("LOCK_ALL"), periodId: z.string().cuid() }),
]);

const ROLES = ["ADMIN", "OPERADOR", "FACTURACION"] as const;

function failure(error: unknown) {
  if (error instanceof PayrollError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  throw error;
}

/** Periods that apply to a messenger (general plus its own), with its lock state and queued changes. */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession([...ROLES, "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const periods = await prisma.payrollPeriod.findMany({
    where: messengerId ? { OR: [{ messengerId: null }, { messengerId }] } : {},
    include: { locks: true },
    orderBy: { fromDate: "desc" },
    take: 200,
  });

  const rows = await Promise.all(
    periods.map(async (period) => {
      const lock = messengerId ? period.locks.find((item) => item.messengerId === messengerId) : null;
      const pending = messengerId
        ? await prisma.payrollPendingChange.count({ where: { messengerId, day: { gte: period.fromDate, lte: period.toDate } } })
        : 0;
      return {
        id: period.id,
        label: period.label,
        fromDate: period.fromDate,
        toDate: period.toDate,
        messengerId: period.messengerId,
        status: lock?.status ?? "ABIERTO",
        lockedAt: lock?.lockedAt ?? null,
        unlockedAt: lock?.unlockedAt ?? null,
        lockedCount: period.locks.filter((item) => item.status === "BLOQUEADO").length,
        pendingChanges: pending,
      };
    }),
  );
  return NextResponse.json({ periods: rows });
}

export async function POST(request: Request) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos del periodo invalidos" }, { status: 400 });

  let fromDate: Date;
  let toDate: Date;
  try {
    fromDate = toPayrollDay(parsed.data.from);
    toDate = toPayrollDay(parsed.data.to);
  } catch {
    return NextResponse.json({ error: "Fechas del periodo invalidas" }, { status: 400 });
  }
  if (fromDate > toDate) return NextResponse.json({ error: "La fecha de inicio no puede ser posterior a la de corte" }, { status: 422 });

  const messengerId = parsed.data.messengerId ?? null;
  const sameScope = await prisma.payrollPeriod.findMany({ where: { messengerId } });
  const clash = sameScope.find((period) => periodsOverlap(period, { fromDate, toDate }));
  if (clash) {
    return NextResponse.json({ error: `Se cruza con el periodo "${clash.label}" (${clash.fromDate.toISOString().slice(0, 10)} a ${clash.toDate.toISOString().slice(0, 10)})` }, { status: 409 });
  }

  const period = await prisma.payrollPeriod.create({
    data: { label: parsed.data.label, fromDate, toDate, messengerId, createdById: auth.session.user.id },
  });
  return NextResponse.json({ period }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
  const body = parsed.data;
  const userId = auth.session.user.id;

  const period = await prisma.payrollPeriod.findUnique({ where: { id: body.periodId } });
  if (!period) return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });

  try {
    if (body.action === "LOCK_ALL") {
      if (period.messengerId) {
        return NextResponse.json({ error: "Un periodo propio de un mensajero se bloquea desde ese mensajero" }, { status: 422 });
      }
      const messengers = await prisma.messenger.findMany({ where: { activo: true }, select: { id: true } });
      for (const messenger of messengers) await lockOne(period.id, messenger.id, userId);
      return NextResponse.json({ locked: messengers.length });
    }

    if (period.messengerId && period.messengerId !== body.messengerId) {
      return NextResponse.json({ error: "Este periodo pertenece a otro mensajero" }, { status: 422 });
    }
    if (body.action === "LOCK") {
      await lockOne(period.id, body.messengerId, userId);
      return NextResponse.json({ status: "BLOQUEADO" });
    }

    const applied = await prisma.$transaction(async (tx) => {
      await tx.payrollPeriodLock.upsert({
        where: { periodId_messengerId: { periodId: period.id, messengerId: body.messengerId } },
        create: { periodId: period.id, messengerId: body.messengerId, status: "ABIERTO", unlockedAt: new Date(), unlockedById: userId },
        update: { status: "ABIERTO", unlockedAt: new Date(), unlockedById: userId },
      });
      await reopenPayment(tx, body.messengerId, period.id);
      const result = await applyPendingChanges(tx, body.messengerId, period.fromDate, period.toDate);
      const payment = await tx.messengerPayment.findUnique({ where: { messengerId_periodId: { messengerId: body.messengerId, periodId: period.id } } });
      if (payment) await refreshPaymentTotals(tx, payment.id);
      return result;
    });
    return NextResponse.json({ status: "ABIERTO", pendingApplied: applied.applied });
  } catch (error) {
    return failure(error);
  }
}

async function lockOne(periodId: string, messengerId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.payrollPeriodLock.findUnique({ where: { periodId_messengerId: { periodId, messengerId } } });
    if (current?.status === "BLOQUEADO") return;
    const now = new Date();
    await tx.payrollPeriodLock.upsert({
      where: { periodId_messengerId: { periodId, messengerId } },
      create: { periodId, messengerId, status: "BLOQUEADO", lockedAt: now, lockedById: userId },
      update: { status: "BLOQUEADO", lockedAt: now, lockedById: userId },
    });
    await closePayment(tx, messengerId, periodId);
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const id = request.nextUrl.searchParams.get("id") ?? "";
  const period = await prisma.payrollPeriod.findUnique({ where: { id }, include: { locks: true } });
  if (!period) return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });
  if (period.locks.some((lock) => lock.status === "BLOQUEADO")) {
    return NextResponse.json({ error: "El periodo tiene mensajeros bloqueados: desbloquealos antes de eliminarlo" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    const payments = await tx.messengerPayment.findMany({ where: { periodId: id }, select: { id: true } });
    await tx.loanInstallment.updateMany({
      where: { paymentId: { in: payments.map((payment) => payment.id) } },
      data: { paymentId: null, appliedCents: null, status: "PENDIENTE" },
    });
    await tx.payrollPeriod.delete({ where: { id } });
  });
  return NextResponse.json({ deleted: true });
}
