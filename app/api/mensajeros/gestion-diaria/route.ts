import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { countedBetween, lockStateFor, totalForCounts } from "@/lib/payroll/counting";
import { openPayment } from "@/lib/payroll/payments";
import { toPayrollDay } from "@/lib/payroll/period";

const recordSchema = z.object({
  type: z.literal("record"),
  messengerId: z.string().cuid(),
  fecha: z.string(),
  entregasNormales: z.number().int().min(0).default(0),
  entregasRemotas: z.number().int().min(0).default(0),
  recogidasBanco: z.number().int().min(0).default(0),
  mandados: z.number().int().min(0).default(0),
  notas: z.string().optional(),
});

const reportSchema = z.object({
  type: z.literal("report"),
  messengerId: z.string().cuid(),
  from: z.string(),
  to: z.string(),
  /** When set, the report is the payment of that period: amounts net of loan installments. */
  periodId: z.string().cuid().optional(),
});

const bodySchema = z.union([recordSchema, reportSchema]);

function parseStartDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const d = new Date(dayOnly ? `${trimmed}T00:00:00.000Z` : trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEndDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const d = new Date(dayOnly ? `${trimmed}T23:59:59.999Z` : trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  const fromDate = from ? parseStartDate(from) : null;
  const toDate = to ? parseEndDate(to) : null;

  const where: Record<string, unknown> = {};
  if (messengerId && messengerId !== "ALL") where.messengerId = messengerId;
  if (fromDate || toDate) {
    where.fecha = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const pageParam = request.nextUrl.searchParams.get("page");
  const pageSizeParam = request.nextUrl.searchParams.get("pageSize");
  const unpaginated = pageParam === null && pageSizeParam === null;
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const pageSize = pageSizeParam ? Math.min(500, Math.max(1, parseInt(pageSizeParam, 10) || 50)) : 50;

  const reportWhere = messengerId && messengerId !== "ALL" ? { messengerId } : undefined;

  const [records, reports, totalRecords, totalReports] = await Promise.all([
    prisma.messengerDailyRecord.findMany({
      where,
      include: { messenger: true },
      orderBy: [{ fecha: "desc" }, { siguienteCorte: "asc" }],
      skip: unpaginated ? undefined : (page - 1) * pageSize,
      take: unpaginated ? undefined : pageSize,
    }),
    prisma.messengerReport.findMany({
      where: reportWhere,
      include: { messenger: true },
      orderBy: { generatedAt: "desc" },
      take: 100,
    }),
    prisma.messengerDailyRecord.count({ where }),
    prisma.messengerReport.count({ where: reportWhere }),
  ]);

  return NextResponse.json({
    records,
    reports,
    total: totalRecords,
    totalReports,
    pagination: {
      page,
      pageSize: unpaginated ? totalRecords : pageSize,
      total: totalRecords,
      totalPages: unpaginated ? 1 : Math.max(1, Math.ceil(totalRecords / pageSize)),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  if (parsed.data.type === "record") {
    let fecha: Date;
    try {
      fecha = toPayrollDay(parsed.data.fecha);
    } catch {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }

    const lock = await lockStateFor(prisma, parsed.data.messengerId, fecha);
    if (lock.locked) {
      return NextResponse.json(
        {
          error: `El periodo "${lock.period?.label}" de este mensajero esta bloqueado. Desbloqueelo para modificar este dia y vuelva a bloquearlo al terminar.`,
          code: "PERIODO_BLOQUEADO",
        },
        { status: 409 },
      );
    }

    const [rates, existing] = await Promise.all([
      prisma.messengerServiceRate.findMany({ where: { messengerId: parsed.data.messengerId } }),
      prisma.messengerDailyRecord.findFirst({
        where: { messengerId: parsed.data.messengerId, siguienteCorte: false, fecha: { gte: fecha, lt: new Date(fecha.getTime() + 24 * 60 * 60 * 1000) } },
      }),
    ]);

    // The automatic count stays the base; what the operator types becomes an
    // adjustment on top of it, so a later recount keeps the correction.
    const autoNormales = existing?.autoNormales ?? 0;
    const autoRemotas = existing?.autoRemotas ?? 0;
    const totalCents = totalForCounts(
      {
        normales: parsed.data.entregasNormales,
        remotas: parsed.data.entregasRemotas,
        recogidas: parsed.data.recogidasBanco,
        mandados: parsed.data.mandados,
      },
      rates,
    );
    const data = {
      entregasNormales: parsed.data.entregasNormales,
      entregasRemotas: parsed.data.entregasRemotas,
      ajusteNormales: parsed.data.entregasNormales - autoNormales,
      ajusteRemotas: parsed.data.entregasRemotas - autoRemotas,
      recogidasBanco: parsed.data.recogidasBanco,
      mandados: parsed.data.mandados,
      totalCents,
      notas: parsed.data.notas,
    };

    const record = existing
      ? await prisma.messengerDailyRecord.update({ where: { id: existing.id }, data })
      : await prisma.messengerDailyRecord.create({ data: { messengerId: parsed.data.messengerId, fecha, ...data } });

    return NextResponse.json({ record });
  }

  const from = parseStartDate(parsed.data.from) ?? new Date(parsed.data.from);
  const to = parseEndDate(parsed.data.to) ?? new Date(parsed.data.to);

  let totalCents: number;
  let days: number;
  if (parsed.data.periodId) {
    const period = await prisma.payrollPeriod.findUnique({ where: { id: parsed.data.periodId } });
    if (!period || (period.messengerId && period.messengerId !== parsed.data.messengerId)) {
      return NextResponse.json({ error: "Periodo no encontrado para este mensajero" }, { status: 404 });
    }
    const payment = await prisma.$transaction((tx) => openPayment(tx, parsed.data.messengerId, period.id));
    totalCents = payment.netCents;
    days = await prisma.messengerDailyRecord.count({ where: { messengerId: parsed.data.messengerId, ...countedBetween(period.fromDate, period.toDate) } });
  } else {
    const records = await prisma.messengerDailyRecord.findMany({
      where: { messengerId: parsed.data.messengerId, fecha: { gte: from, lte: to } },
    });
    totalCents = records.reduce((acc, item) => acc + item.totalCents, 0);
    days = records.length;
  }

  const report = await prisma.messengerReport.create({
    data: {
      messengerId: parsed.data.messengerId,
      fromDate: from,
      toDate: to,
      totalCents,
      generatedById: auth.session.user.id,
    },
  });

  return NextResponse.json({ report, totalCents, days }, { status: 201 });
}
