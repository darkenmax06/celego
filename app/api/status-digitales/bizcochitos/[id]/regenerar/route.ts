import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { writeAuditEvent } from "@/lib/audit";
import {
  bizcochitoCardInclude,
  buildBizcochitoExcel,
  createBizcochitoSnapshot,
} from "@/lib/bizcochito";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const batch = await prisma.bizcochitoBatch.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      items: {
        select: {
          cardId: true,
          digitalDeliveryCycle: true,
          sequence: true,
        },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!batch) {
    return NextResponse.json({ error: "Bizcochito no encontrado" }, { status: 404 });
  }

  const cards = await prisma.card.findMany({
    where: { id: { in: batch.items.map((item) => item.cardId) } },
    include: bizcochitoCardInclude,
  });
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const rows = batch.items.flatMap((item) => {
    const card = cardById.get(item.cardId);
    return card
      ? [createBizcochitoSnapshot(card, batch.code, item.digitalDeliveryCycle)]
      : [];
  });
  const file = await buildBizcochitoExcel(rows);
  const fileName = `${batch.code}-datos-actuales.xlsx`;

  await writeAuditEvent({
    entity: "BIZCOCHITO",
    entityId: batch.id,
    action: "REGENERATE_CURRENT",
    userId: auth.session.user.id,
    details: { code: batch.code, itemCount: rows.length },
    request,
  });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
