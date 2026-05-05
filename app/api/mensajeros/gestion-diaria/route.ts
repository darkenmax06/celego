import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

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
});

const bodySchema = z.union([recordSchema, reportSchema]);

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (messengerId) where.messengerId = messengerId;
  if (from || to) {
    where.fecha = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const [records, reports] = await Promise.all([
    prisma.messengerDailyRecord.findMany({
      where,
      include: { messenger: true },
      orderBy: { fecha: "desc" },
      take: 300,
    }),
    prisma.messengerReport.findMany({
      where: messengerId ? { messengerId } : undefined,
      include: { messenger: true },
      orderBy: { generatedAt: "desc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({ records, reports });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  if (parsed.data.type === "record") {
    const rates = await prisma.messengerServiceRate.findMany({
      where: { messengerId: parsed.data.messengerId },
    });

    const rate = (serviceType: string) => rates.find((r) => r.serviceType === serviceType)?.amountCents ?? 0;

    const totalCents =
      parsed.data.entregasNormales * rate("NORMAL") +
      parsed.data.entregasRemotas * rate("REMOTA") +
      parsed.data.recogidasBanco * rate("RECOGIDA") +
      parsed.data.mandados * rate("MANDADO");

    const fecha = new Date(parsed.data.fecha);
    const start = new Date(fecha);
    start.setHours(0, 0, 0, 0);
    const end = new Date(fecha);
    end.setHours(23, 59, 59, 999);

    const existing = await prisma.messengerDailyRecord.findFirst({
      where: {
        messengerId: parsed.data.messengerId,
        fecha: { gte: start, lte: end },
      },
    });

    const record = existing
      ? await prisma.messengerDailyRecord.update({
          where: { id: existing.id },
          data: {
            entregasNormales: parsed.data.entregasNormales,
            entregasRemotas: parsed.data.entregasRemotas,
            recogidasBanco: parsed.data.recogidasBanco,
            mandados: parsed.data.mandados,
            totalCents,
            notas: parsed.data.notas,
          },
        })
      : await prisma.messengerDailyRecord.create({
          data: {
            messengerId: parsed.data.messengerId,
            fecha,
            entregasNormales: parsed.data.entregasNormales,
            entregasRemotas: parsed.data.entregasRemotas,
            recogidasBanco: parsed.data.recogidasBanco,
            mandados: parsed.data.mandados,
            totalCents,
            notas: parsed.data.notas,
          },
        });

    return NextResponse.json({ record });
  }

  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);

  const records = await prisma.messengerDailyRecord.findMany({
    where: {
      messengerId: parsed.data.messengerId,
      fecha: { gte: from, lte: to },
    },
  });

  const totalCents = records.reduce((acc, item) => acc + item.totalCents, 0);

  const report = await prisma.messengerReport.create({
    data: {
      messengerId: parsed.data.messengerId,
      fromDate: from,
      toDate: to,
      totalCents,
      generatedById: auth.session.user.id,
    },
  });

  return NextResponse.json({ report, totalCents, days: records.length }, { status: 201 });
}
