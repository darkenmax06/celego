import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loanBalanceCents, nextPendingInstallment, uncoveredCents } from "@/lib/payroll/loan-schedule";

type Db = Prisma.TransactionClient | typeof prisma;

export class PayrollError extends Error {
  constructor(
    public readonly code: "PERIODO_BLOQUEADO" | "NO_ENCONTRADO" | "INVALIDO",
    message: string,
    public readonly status: 404 | 409 | 422,
  ) {
    super(message);
    this.name = "PayrollError";
  }
}

/**
 * Keeps a loan's pending installments consistent with what is really owed.
 *
 * - Money not covered by any pending installment (after an omission or a smaller
 *   deduction) becomes a new installment at the end.
 * - Pending installments that cover more than the balance (after a bigger
 *   deduction) are trimmed from the end. Installments attached to a payment are
 *   never touched; they belong to a payment that is still being edited.
 * - A loan with nothing left owed is marked PAGADO, and ACTIVO again if it is not.
 */
export async function rebalanceLoan(db: Db, loanId: string) {
  const loan = await db.loan.findUnique({ where: { id: loanId }, include: { installments: { orderBy: { number: "asc" } } } });
  if (!loan || loan.status === "CANCELADO") return;

  const gap = uncoveredCents(loan.principalCents, loan.installments);
  if (gap > 0) {
    const nextNumber = Math.max(0, ...loan.installments.map((item) => item.number)) + 1;
    await db.loanInstallment.create({ data: { loanId, number: nextNumber, plannedCents: gap } });
  } else if (gap === 0) {
    let excess =
      loan.installments.filter((item) => item.status === "PENDIENTE").reduce((total, item) => total + item.plannedCents, 0) -
      loanBalanceCents(loan.principalCents, loan.installments);
    const trimmable = loan.installments.filter((item) => item.status === "PENDIENTE" && !item.paymentId).sort((a, b) => b.number - a.number);
    for (const item of trimmable) {
      if (excess <= 0) break;
      const cut = Math.min(item.plannedCents, excess);
      excess -= cut;
      if (cut === item.plannedCents) await db.loanInstallment.delete({ where: { id: item.id } });
      else await db.loanInstallment.update({ where: { id: item.id }, data: { plannedCents: item.plannedCents - cut } });
    }
  }

  const fresh = await db.loanInstallment.findMany({ where: { loanId } });
  const settled = loanBalanceCents(loan.principalCents, fresh) === 0 && !fresh.some((item) => item.status === "PENDIENTE");
  const status = settled ? "PAGADO" : "ACTIVO";
  if (loan.status !== status) await db.loan.update({ where: { id: loanId }, data: { status } });
}

/** Recomputes gross, deduction and net of a payment still open, from its daily records and installments. */
export async function refreshPaymentTotals(db: Db, paymentId: string) {
  const payment = await db.messengerPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { period: true, installments: true },
  });
  if (payment.lockedAt) return payment;

  const records = await db.messengerDailyRecord.findMany({
    where: { messengerId: payment.messengerId, fecha: { gte: payment.period.fromDate, lt: new Date(payment.period.toDate.getTime() + 24 * 60 * 60 * 1000) } },
    select: { totalCents: true },
  });
  const grossCents = records.reduce((total, record) => total + record.totalCents, 0);
  const deductionCents = payment.installments
    .filter((item) => item.status !== "OMITIDA")
    .reduce((total, item) => total + (item.appliedCents ?? item.plannedCents), 0);
  return db.messengerPayment.update({
    where: { id: paymentId },
    data: { grossCents, deductionCents, netCents: grossCents - deductionCents },
    include: { period: true, installments: true },
  });
}

/**
 * The payment of one messenger for one period, created on first view. While the
 * period is open each active loan puts its next pending installment on the
 * payment (one per loan), at its planned amount, ready to be raised, lowered or skipped.
 */
export async function openPayment(db: Db, messengerId: string, periodId: string) {
  const payment = await db.messengerPayment.upsert({
    where: { messengerId_periodId: { messengerId, periodId } },
    create: { messengerId, periodId },
    update: {},
    include: { installments: true },
  });

  if (!payment.lockedAt) {
    const loans = await db.loan.findMany({ where: { messengerId, status: "ACTIVO" }, include: { installments: true } });
    for (const loan of loans) {
      if (loan.installments.some((item) => item.paymentId === payment.id)) continue;
      const next = nextPendingInstallment(loan.installments.filter((item) => !item.paymentId));
      if (next) await db.loanInstallment.update({ where: { id: next.id }, data: { paymentId: payment.id, appliedCents: next.plannedCents } });
    }
  }

  await refreshPaymentTotals(db, payment.id);
  return db.messengerPayment.findUniqueOrThrow({
    where: { id: payment.id },
    include: {
      period: true,
      installments: { include: { loan: { select: { id: true, principalCents: true, note: true, installmentCount: true } } }, orderBy: [{ loanId: "asc" }, { number: "asc" }] },
    },
  });
}

export type InstallmentAction =
  | { action: "SET_AMOUNT"; appliedCents: number }
  | { action: "OMIT" }
  | { action: "RESTORE" };

/** Raises, lowers, skips or restores the installment of an open payment. */
export async function changeInstallment(db: Db, installmentId: string, change: InstallmentAction) {
  const installment = await db.loanInstallment.findUnique({ where: { id: installmentId }, include: { payment: true } });
  if (!installment) throw new PayrollError("NO_ENCONTRADO", "Cuota no encontrada", 404);
  if (!installment.payment) throw new PayrollError("INVALIDO", "La cuota aun no esta en un pago", 422);
  if (installment.payment.lockedAt) {
    throw new PayrollError("PERIODO_BLOQUEADO", "El periodo de este pago esta bloqueado: desbloqueelo para modificar la cuota", 409);
  }

  if (change.action === "SET_AMOUNT") {
    if (!Number.isInteger(change.appliedCents) || change.appliedCents < 0) {
      throw new PayrollError("INVALIDO", "La cuota debe ser un monto igual o mayor que 0", 422);
    }
    await db.loanInstallment.update({
      where: { id: installmentId },
      data: { appliedCents: change.appliedCents, status: "PENDIENTE" },
    });
  } else if (change.action === "OMIT") {
    await db.loanInstallment.update({ where: { id: installmentId }, data: { status: "OMITIDA", appliedCents: 0 } });
  } else {
    await db.loanInstallment.update({
      where: { id: installmentId },
      data: { status: "PENDIENTE", appliedCents: installment.plannedCents },
    });
  }
  await refreshPaymentTotals(db, installment.payment.id);
}

/**
 * Closes a messenger's payment for a period: totals are frozen and the installments
 * on it are applied to their loans. Omitted installments stay omitted and their
 * money returns to the loan's schedule.
 */
export async function closePayment(db: Db, messengerId: string, periodId: string) {
  const opened = await openPayment(db, messengerId, periodId);
  const now = new Date();
  for (const item of opened.installments) {
    if (item.status === "OMITIDA") continue;
    await db.loanInstallment.update({
      where: { id: item.id },
      data: { status: "APLICADA", appliedCents: item.appliedCents ?? item.plannedCents, appliedAt: now },
    });
  }
  await db.messengerPayment.update({ where: { id: opened.id }, data: { lockedAt: now } });
  for (const loanId of new Set(opened.installments.map((item) => item.loanId))) await rebalanceLoan(db, loanId);
}

/** Reopens a closed payment: applied installments go back to editable drafts. */
export async function reopenPayment(db: Db, messengerId: string, periodId: string) {
  const payment = await db.messengerPayment.findUnique({ where: { messengerId_periodId: { messengerId, periodId } }, include: { installments: true } });
  if (!payment) return;
  for (const item of payment.installments) {
    if (item.status === "APLICADA") {
      await db.loanInstallment.update({ where: { id: item.id }, data: { status: "PENDIENTE", appliedAt: null } });
    }
  }
  await db.messengerPayment.update({ where: { id: payment.id }, data: { lockedAt: null } });
  for (const loanId of new Set(payment.installments.map((item) => item.loanId))) await rebalanceLoan(db, loanId);
  await refreshPaymentTotals(db, payment.id);
}
