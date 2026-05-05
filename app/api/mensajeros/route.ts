import { NextRequest, NextResponse } from "next/server";
import { MessengerServiceType } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const rateSchema = z.object({
  serviceType: z.nativeEnum(MessengerServiceType),
  amountCents: z.number().int().min(0),
});

const createSchema = z.object({
  nombre: z.string().min(2),
  telefono: z.string().optional(),
  zonaPrincipal: z.string().optional(),
  rates: z.array(rateSchema).default([]),
});

const updateSchema = createSchema.extend({
  id: z.string().cuid(),
  activo: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const id = request.nextUrl.searchParams.get("id");
  const pageParam = request.nextUrl.searchParams.get("page");
  const pageSizeParam = request.nextUrl.searchParams.get("pageSize");
  const onlyActive = request.nextUrl.searchParams.get("onlyActive") === "1";

  if (id) {
    const messenger = await prisma.messenger.findUnique({
      where: { id },
      include: {
        serviceRates: true,
        dailyRecords: { orderBy: { fecha: "desc" }, take: 30 },
        reports: { orderBy: { generatedAt: "desc" }, take: 20 },
      },
    });

    if (!messenger) {
      return NextResponse.json({ error: "Mensajero no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ messenger });
  }

  const where = onlyActive ? { activo: true } : undefined;

  if (!pageParam && !pageSizeParam) {
    const messengers = await prisma.messenger.findMany({
      where,
      include: { serviceRates: true },
      orderBy: { nombre: "asc" },
    });
    return NextResponse.json({ messengers });
  }

  const pageRaw = Number(pageParam ?? "1");
  const pageSizeRaw = Number(pageSizeParam ?? "25");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, Math.trunc(pageSizeRaw))) : 25;

  const [messengers, total] = await Promise.all([
    prisma.messenger.findMany({
      where,
      include: { serviceRates: true },
      orderBy: { nombre: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.messenger.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    messengers,
    pagination: { page, pageSize, total, totalPages },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const messenger = await prisma.messenger.create({
    data: {
      nombre: parsed.data.nombre,
      telefono: parsed.data.telefono,
      zonaPrincipal: parsed.data.zonaPrincipal,
      serviceRates: {
        create: parsed.data.rates,
      },
    },
    include: { serviceRates: true },
  });

  return NextResponse.json({ messenger }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const messenger = await prisma.messenger.update({
    where: { id: parsed.data.id },
    data: {
      nombre: parsed.data.nombre,
      telefono: parsed.data.telefono,
      zonaPrincipal: parsed.data.zonaPrincipal,
      activo: parsed.data.activo,
    },
  });

  await prisma.messengerServiceRate.deleteMany({ where: { messengerId: messenger.id } });
  if (parsed.data.rates.length) {
    await prisma.messengerServiceRate.createMany({
      data: parsed.data.rates.map((rate) => ({ ...rate, messengerId: messenger.id })),
    });
  }

  const full = await prisma.messenger.findUnique({
    where: { id: messenger.id },
    include: { serviceRates: true },
  });

  return NextResponse.json({ messenger: full });
}

export async function DELETE(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const { id } = (await request.json()) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  await prisma.messenger.update({ where: { id }, data: { activo: false } });
  return NextResponse.json({ ok: true });
}
