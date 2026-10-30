import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { requireActiveMessenger } from "@/lib/messenger-lifecycle";
import { prisma } from "@/lib/prisma";
import { LoanScheduleError, buildLoanSchedule, loanBalanceCents } from "@/lib/payroll/loan-schedule";
import { rebalanceLoan } from "@/lib/payroll/payments";

const ROLES = ["ADMIN", "OPERADOR", "FACTURACION"] as const;

const createSchema = z.object({
  messengerId: z.string().cuid(),
  principalCents: z.number().int().positive(),
  installmentCount: z.number().int().min(1).max(120),
  mode: z.enum(["IGUALES", "PERSONALIZADAS"]),
  customAmountsCents: z.array(z.number().int().positive()).optional(),
  note: z.string().trim().max(300).optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CANCEL"), loanId: z.string().cuid() }),
  z.object({ action: z.literal("SET_PLANNED"), installmentId: z.string().cuid(), plannedCents: z.number().int().positive() }),
]);

function withBalance<T extends { principalCents: number; installments: { number: number; plannedCents: number; appliedCents: number | null; status: "PENDIENTE" | "APLICADA" | "OMITIDA" }[] }>(loan: T) {
  return { ...loan, balanceCents: loanBalanceCents(loan.principalCents, loan.installments) };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const loans = await prisma.loan.findMany({
    where: messengerId ? { messengerId } : {},
    include: { installments: { orderBy: { number: "asc" } }, messenger: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ loans: loans.map(withBalance) });
}

export async function POST(request: Request) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos del prestamo invalidos" }, { status: 400 });
  const data = parsed.data;

  let plan: number[];
  try {
    plan = buildLoanSchedule({ ...data });
  } catch (error) {
    if (error instanceof LoanScheduleError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }

  const guard = await requireActiveMessenger(prisma, data.messengerId);
  if ("error" in guard) return guard.error;

  const loan = await prisma.loan.create({
    data: {
      messengerId: data.messengerId,
      principalCents: data.principalCents,
      installmentCount: data.installmentCount,
      mode: data.mode,
      note: data.note || null,
      createdById: auth.session.user.id,
      installments: { create: plan.map((plannedCents, index) => ({ number: index + 1, plannedCents })) },
    },
    include: { installments: { orderBy: { number: "asc" } } },
  });
  return NextResponse.json({ loan: withBalance(loan) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
  const body = parsed.data;

  if (body.action === "CANCEL") {
    const loan = await prisma.loan.findUnique({ where: { id: body.loanId } });
    if (!loan) return NextResponse.json({ error: "Prestamo no encontrado" }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      // Applied installments are history; everything still to come is dropped.
      await tx.loanInstallment.deleteMany({ where: { loanId: loan.id, status: { not: "APLICADA" }, payment: { is: { lockedAt: null } } } });
      await tx.loanInstallment.deleteMany({ where: { loanId: loan.id, status: { not: "APLICADA" }, paymentId: null } });
      await tx.loan.update({ where: { id: loan.id }, data: { status: "CANCELADO" } });
    });
    return NextResponse.json({ status: "CANCELADO" });
  }

  const installment = await prisma.loanInstallment.findUnique({ where: { id: body.installmentId } });
  if (!installment) return NextResponse.json({ error: "Cuota no encontrada" }, { status: 404 });
  if (installment.status !== "PENDIENTE" || installment.paymentId) {
    return NextResponse.json({ error: "Solo se puede cambiar el plan de una cuota futura; la del pago en curso se edita desde el pago" }, { status: 409 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.loanInstallment.update({ where: { id: installment.id }, data: { plannedCents: body.plannedCents } });
    await rebalanceLoan(tx, installment.loanId);
  });
  return NextResponse.json({ ok: true });
}
