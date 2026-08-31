import { NextRequest, NextResponse } from "next/server";
import { Prisma, SLAExtensionRequestStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { addBusinessDaysStrict } from "@/lib/sla";

const createSchema = z.object({
  cardId: z.string().cuid(),
  provinciaDestino: z.string().optional(),
  motivo: z.string().min(3).max(1000),
  diasSolicitados: z.number().int().min(1).max(30).default(5),
});

const patchSchema = z.object({
  id: z.string().cuid(),
  status: z.nativeEnum(SLAExtensionRequestStatus),
  diasAprobados: z.number().int().min(1).max(30).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const status = request.nextUrl.searchParams.get("status");
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const provincia = request.nextUrl.searchParams.get("provincia");

  const where: Prisma.SLAExtensionRequestWhereInput = {
    AND: [
      status && status !== "ALL"
        ? { status: status as SLAExtensionRequestStatus }
        : {},
      provincia && provincia !== "ALL"
        ? {
            OR: [
              { provinciaOrigen: provincia },
              { provinciaDestino: provincia },
            ],
          }
        : {},
      q
        ? {
            OR: [
              { tc: { contains: q, mode: "insensitive" } },
              { cedula: { contains: q, mode: "insensitive" } },
              { nombre: { contains: q, mode: "insensitive" } },
              { motivo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const requests = await prisma.sLAExtensionRequest.findMany({
    where,
    include: {
      card: {
        select: {
          id: true,
          tc: true,
          status: true,
          slaDueDate: true,
          provincia: true,
          zona: true,
          currentMessenger: { select: { nombre: true } },
        },
      },
      solicitadoPor: { select: { name: true, email: true } },
      aprobadoPor: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({
    requests: requests.map((item) => ({
      id: item.id,
      cardId: item.cardId,
      tc: item.tc,
      cedula: item.cedula,
      nombre: item.nombre,
      provinciaOrigen: item.provinciaOrigen,
      provinciaDestino: item.provinciaDestino,
      motivo: item.motivo,
      diasSolicitados: item.diasSolicitados,
      status: item.status,
      cardStatus: item.card?.status ?? null,
      slaDueDate: item.card?.slaDueDate?.toISOString() ?? null,
      mensajero: item.card?.currentMessenger?.nombre ?? "Sin asignar",
      solicitadoPor: item.solicitadoPor?.name ?? "Operador",
      aprobadoPor: item.aprobadoPor?.name ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de solicitud inválidos" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({
    where: { id: parsed.data.cardId },
    include: { customer: true },
  });

  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }

  const created = await prisma.sLAExtensionRequest.create({
    data: {
      cardId: card.id,
      tc: card.tc,
      cedula: card.customer.cedula,
      nombre: card.customer.nombre,
      provinciaOrigen: card.provincia,
      provinciaDestino: parsed.data.provinciaDestino || null,
      motivo: parsed.data.motivo,
      diasSolicitados: parsed.data.diasSolicitados,
      status: SLAExtensionRequestStatus.PENDIENTE,
      solicitadoPorId: auth.session.user.id,
    },
  });

  return NextResponse.json({ request: created }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const existing = await prisma.sLAExtensionRequest.findUnique({
    where: { id: parsed.data.id },
    include: { card: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  const updated = await prisma.sLAExtensionRequest.update({
    where: { id: parsed.data.id },
    data: {
      status: parsed.data.status,
      aprobadoPorId: auth.session.user.id,
    },
  });

  // If approved by bank/admin, automatically extend card SLA dueDate
  if (parsed.data.status === SLAExtensionRequestStatus.APROBADA && existing.card) {
    const extraDays = parsed.data.diasAprobados ?? existing.diasSolicitados;
    const baseDate = existing.card.slaDueDate ? new Date(existing.card.slaDueDate) : new Date();
    const newDueDate = addBusinessDaysStrict(baseDate, extraDays);

    await prisma.card.update({
      where: { id: existing.card.id },
      data: {
        slaDueDate: newDueDate,
        slaExtensionDays: { increment: extraDays },
      },
    });
  }

  return NextResponse.json({ request: updated });
}
