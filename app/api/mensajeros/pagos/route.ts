import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { PayrollError, changeInstallment, openPayment } from "@/lib/payroll/payments";

const ROLES = ["ADMIN", "OPERADOR", "FACTURACION"] as const;

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SET_AMOUNT"), installmentId: z.string().cuid(), appliedCents: z.number().int().min(0) }),
  z.object({ action: z.literal("OMIT"), installmentId: z.string().cuid() }),
  z.object({ action: z.literal("RESTORE"), installmentId: z.string().cuid() }),
]);

/**
 * With `periodId`: the messenger's payment for that period (created on first view,
 * with each active loan's next installment attached). Without it: every payment
 * of the messenger, newest period first.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const messengerId = request.nextUrl.searchParams.get("messengerId") ?? "";
  const periodId = request.nextUrl.searchParams.get("periodId");
  if (!messengerId) return NextResponse.json({ error: "messengerId requerido" }, { status: 400 });

  if (periodId) {
    const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period || (period.messengerId && period.messengerId !== messengerId)) {
      return NextResponse.json({ error: "Periodo no encontrado para este mensajero" }, { status: 404 });
    }
    const payment = await prisma.$transaction((tx) => openPayment(tx, messengerId, periodId));
    return NextResponse.json({ payment });
  }

  const payments = await prisma.messengerPayment.findMany({
    where: { messengerId },
    include: {
      period: true,
      installments: { include: { loan: { select: { id: true, principalCents: true, note: true, installmentCount: true } } }, orderBy: [{ loanId: "asc" }, { number: "asc" }] },
    },
    orderBy: { period: { fromDate: "desc" } },
    take: 100,
  });
  return NextResponse.json({ payments });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Cuota invalida" }, { status: 400 });
  const { installmentId, ...change } = parsed.data;

  try {
    await prisma.$transaction((tx) => changeInstallment(tx, installmentId, change));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PayrollError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
