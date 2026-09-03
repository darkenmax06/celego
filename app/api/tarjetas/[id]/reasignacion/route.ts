import { CardStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/utils";

const schema = z.object({
  provinceId: z.string().cuid(),
  messengerId: z.string().cuid(),
  note: z.string().trim().max(500).optional(),
});

const ALLOWED_STATUSES = new Set<CardStatus>([
  CardStatus.ENTREGADA,
  CardStatus.ENTREGA_DIGITAL,
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de reasignacion invalidos" }, { status: 400 });
  }

  const { id } = await params;
  const [card, province, messenger, latestRoute] = await Promise.all([
    prisma.card.findUnique({
      where: { id },
      include: {
        reassignedMessenger: true,
      },
    }),
    prisma.provinceConfig.findUnique({
      where: { id: parsed.data.provinceId },
    }),
    prisma.messenger.findUnique({
      where: { id: parsed.data.messengerId },
    }),
    prisma.route.findFirst({
      where: {
        items: {
          some: {
            cardId: id,
          },
        },
      },
      include: {
        messenger: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }
  if (!ALLOWED_STATUSES.has(card.status)) {
    return NextResponse.json(
      { error: "La reasignacion solo aplica a tarjetas ya entregadas o con entrega digital" },
      { status: 409 },
    );
  }
  if (!province?.active) {
    return NextResponse.json({ error: "Provincia no disponible" }, { status: 400 });
  }
  if (
    !messenger?.activo ||
    !messenger.provinciaTrabajo ||
    normalizeText(messenger.provinciaTrabajo) !== normalizeText(province.nombre)
  ) {
    return NextResponse.json(
      { error: "El mensajero no esta activo en la provincia seleccionada" },
      { status: 400 },
    );
  }

  const previousMessenger = card.reassignedMessenger ?? latestRoute?.messenger ?? null;
  const previousProvince = card.reassignedProvince?.trim() || card.provincia;
  const previousZone = card.reassignedZone?.trim() || card.zona;

  const updated = await prisma.$transaction(async (tx) => {
    const reassignment = await tx.cardDeliveryReassignment.create({
      data: {
        cardId: card.id,
        fromProvince: previousProvince,
        fromZone: previousZone,
        fromMessengerId: previousMessenger?.id ?? null,
        fromMessengerName: previousMessenger?.nombre ?? null,
        toProvince: province.nombre,
        toZone: province.zona,
        toMessengerId: messenger.id,
        toMessengerName: messenger.nombre,
        note: parsed.data.note?.trim() || null,
        byUserId: auth.session.user.id,
      },
      include: {
        byUser: true,
        fromMessenger: true,
        toMessenger: true,
      },
    });

    const nextCard = await tx.card.update({
      where: { id: card.id },
      data: {
        reassignedProvince: province.nombre,
        reassignedZone: province.zona,
        reassignedMessengerId: messenger.id,
        lastAssignedMessengerId: messenger.id,
        reassignedAt: reassignment.createdAt,
      },
      include: {
        customer: true,
        currentMessenger: true,
        lastAssignedMessenger: true,
        reassignedMessenger: true,
      },
    });

    await tx.auditLog.create({
      data: {
        entity: "CARD_DELIVERY_REASSIGNMENT",
        entityId: reassignment.id,
        action: "CREATE",
        userId: auth.session.user.id,
        details: {
          cardId: card.id,
          status: card.status,
          fromProvince: previousProvince,
          fromZone: previousZone,
          fromMessengerId: previousMessenger?.id ?? null,
          toProvince: province.nombre,
          toZone: province.zona,
          toMessengerId: messenger.id,
          note: parsed.data.note?.trim() || null,
        } as Prisma.InputJsonValue,
      },
    });

    return { card: nextCard, reassignment };
  });

  return NextResponse.json(updated, { status: 201 });
}
