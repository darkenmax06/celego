import { NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { parseEntregasRetornosImport } from "@/lib/importers/entregas-retornos";
import { prisma } from "@/lib/prisma";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const parsed = parseEntregasRetornosImport(Buffer.from(await file.arrayBuffer()));
  let updated = 0;

  for (const row of parsed.rows) {
    const card = await prisma.card.findFirst({
      where: {
        tc: row.tc,
        customer: { cedula: row.cedula },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!card) continue;

    const nextStatus = row.status === "ENTREGADA" ? CardStatus.ENTREGADA : CardStatus.RETORNADA;

    await prisma.$transaction(async (tx) => {
      await tx.card.update({
        where: { id: card.id },
        data: {
          status: nextStatus,
          returnReason: row.status === "RETORNADA" ? row.comentario || null : null,
        },
      });

      await clearUrgencyOnCardClosure({
        tx,
        cardId: card.id,
        nextStatus,
        byUserId: auth.session.user.id,
      });

      await tx.cardStatusLog.create({
        data: {
          cardId: card.id,
          fromStatus: card.status,
          toStatus: nextStatus,
          note: row.comentario || "Actualizado por importacion E/R",
          byUserId: auth.session.user.id,
        },
      });
    });

    updated += 1;
  }

  return NextResponse.json({
    imported: parsed.rows.length,
    updated,
    errors: parsed.errors,
  });
}
