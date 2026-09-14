import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { writeAuditEvent } from "@/lib/audit";
import { buildCardExportRows, cardSelectionExportSchema } from "@/lib/card-selection-export";
import { prisma } from "@/lib/prisma";
import { exportRowsToCsv, exportRowsToXlsx } from "@/lib/reports/export";

/** Exports the cards picked in a selectable card view with the chosen fields. */
export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = cardSelectionExportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const cardIds = [...new Set(parsed.data.cardIds)];
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    include: {
      customer: { select: { nombre: true, cedula: true, telefonosRaw: true, direccionRaw: true } },
      currentMessenger: { select: { nombre: true } },
    },
  });

  if (!cards.length) {
    return NextResponse.json({ error: "No hay tarjetas para exportar" }, { status: 404 });
  }

  // Keep the order the user selected the cards in.
  const position = new Map(cardIds.map((id, index) => [id, index]));
  cards.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));

  const rows = buildCardExportRows(cards, parsed.data.fields);
  const today = new Date().toISOString().slice(0, 10);
  const format = parsed.data.format;

  await writeAuditEvent({
    entity: "CARD_SELECTION_EXPORT",
    entityId: today,
    action: "EXPORT",
    userId: auth.session.user.id,
    details: { format, rowCount: rows.length, fields: parsed.data.fields },
    request,
  });

  if (format === "csv") {
    // BOM so Excel opens accented Spanish headers correctly.
    return new NextResponse(`\uFEFF${exportRowsToCsv(rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tarjetas-seleccion-${today}.csv"`,
      },
    });
  }

  const xlsx = await exportRowsToXlsx(rows, "Tarjetas");
  return new NextResponse(xlsx, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tarjetas-seleccion-${today}.xlsx"`,
    },
  });
}
