import { NextRequest, NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { applyCardTransition } from "@/lib/card-transition";

/**
 * SDD contrato-tarjetas-pistoleo (spec: pending-contract-workqueue).
 *
 * Lists cards stuck in either contract exception status and provides the two
 * ONLY resolution actions:
 *  - `SUBIR_CONTRATO`: uploads the `(C)` contract image for a card in
 *    ENTREGA_DIGITAL_SIN_CONTRATO -> ENTREGA_DIGITAL. Same mechanism as the
 *    digital batch intake (`app/api/status-digitales/route.ts`), scoped to a
 *    single card.
 *  - `MARCAR_ENTREGADO`: marks a card in ENTREGA_SIN_CONTRATO as delivered ->
 *    ACUSE_RECIBIDO. Printing the relación is triggered client-side against
 *    `GET /api/rutas/export?cardId=...`.
 */

const PENDING_STATUSES = [CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO, CardStatus.ENTREGA_SIN_CONTRATO] as const;

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const statusParam = request.nextUrl.searchParams.get("status");
  const searchParam = request.nextUrl.searchParams.get("search")?.trim();

  const statuses =
    statusParam && (PENDING_STATUSES as readonly string[]).includes(statusParam)
      ? [statusParam as CardStatus]
      : [...PENDING_STATUSES];

  const cards = await prisma.card.findMany({
    where: {
      hasContract: true,
      status: { in: statuses },
      ...(searchParam
        ? {
            OR: [
              { tc: { contains: searchParam, mode: "insensitive" } },
              { customer: { nombre: { contains: searchParam, mode: "insensitive" } } },
              { customer: { cedula: { contains: searchParam, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      tc: true,
      status: true,
      provincia: true,
      contractImageAt: true,
      customer: {
        select: {
          nombre: true,
          cedula: true,
          telefonosRaw: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  return NextResponse.json({ cards });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    cardId: z.string().min(1),
    action: z.literal("SUBIR_CONTRATO"),
    fileName: z.string().min(1),
  }),
  z.object({
    cardId: z.string().min(1),
    action: z.literal("MARCAR_ENTREGADO"),
  }),
]);

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({ where: { id: parsed.data.cardId } });
  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }

  if (parsed.data.action === "SUBIR_CONTRATO") {
    if (card.status !== CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO) {
      return NextResponse.json(
        { error: "La tarjeta no esta pendiente de imagen de contrato" },
        { status: 409 },
      );
    }

    const fileName = parsed.data.fileName;
    const updated = await prisma.$transaction(async (tx) => {
      await applyCardTransition({
        tx,
        card,
        nextStatus: CardStatus.ENTREGA_DIGITAL,
        byUserId: auth.session.user.id,
        note: `Imagen de contrato registrada desde Contratos pendientes: ${fileName}`,
        data: {
          contractImageAt: new Date(),
          contractImageFile: fileName,
        },
      });
      return tx.card.findUniqueOrThrow({ where: { id: card.id } });
    });

    return NextResponse.json({ card: updated });
  }

  // MARCAR_ENTREGADO
  if (card.status !== CardStatus.ENTREGA_SIN_CONTRATO) {
    return NextResponse.json(
      { error: "La tarjeta no esta pendiente de confirmacion de entrega" },
      { status: 409 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await applyCardTransition({
      tx,
      card,
      nextStatus: CardStatus.ACUSE_RECIBIDO,
      byUserId: auth.session.user.id,
      note: "Entrega confirmada desde Contratos pendientes",
    });
    return tx.card.findUniqueOrThrow({ where: { id: card.id } });
  });

  return NextResponse.json({ card: updated });
}
