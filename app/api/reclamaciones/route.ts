import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 3, task 3.2.
 *
 * POST: accepts a manual reclamacion form submission (spec "Reclamacion
 * Form Intake") and creates a level-3 RECLAMACION `UrgentCase`. The
 * submitted `nuevaDireccion` is stored case-locally in `details` and MUST
 * NOT mutate `Card.direccion` (design D8/Q5) — there is no `Card.direccion`
 * column to write in the first place, only `Customer`, which this route
 * never touches.
 */
const payloadSchema = z.object({
  cardId: z.string().min(1),
  nombre: z.string().min(1),
  cedula: z.string().min(1),
  tc: z.string().min(1),
  nuevaDireccion: z.string().min(1),
  telefono: z.string().optional(),
  numero: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const data = parsed.data;
  const card = await prisma.card.findUnique({
    where: { id: data.cardId },
    select: { id: true, status: true },
  });

  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }

  const numero = data.numero ?? data.telefono ?? "";

  const urgentCase = await prisma.urgentCase.create({
    data: {
      cardId: card.id,
      tc: data.tc,
      cedula: data.cedula,
      telefono: data.telefono ?? numero,
      status: "RECLAMACION_ABIERTA",
      level: 3,
      resolvedAt: null,
      caseType: "RECLAMACION",
      details: {
        nuevaDireccion: data.nuevaDireccion,
        numero,
      },
      createdById: auth.session.user.id,
    },
  });

  await prisma.card.update({
    where: { id: card.id },
    data: { urgent: true, hadReclamacion: true },
  });

  await prisma.cardStatusLog.create({
    data: {
      cardId: card.id,
      fromStatus: card.status,
      toStatus: card.status,
      note: `Reclamacion registrada para ${data.nombre}.`,
      byUserId: auth.session.user.id,
    },
  });

  return NextResponse.json({ case: urgentCase }, { status: 201 });
}

export async function GET(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const cardId = searchParams.get("cardId");

  const cases = await prisma.urgentCase.findMany({
    where: {
      caseType: "RECLAMACION",
      ...(cardId ? { cardId } : {}),
    },
    orderBy: { importedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ cases });
}
