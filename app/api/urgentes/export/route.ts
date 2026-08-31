import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { exportRowsToCsv, exportRowsToPdf, exportRowsToXlsx } from "@/lib/reports/export";
import { writeAuditEvent } from "@/lib/audit";

const exportSchema = z
  .object({
    cardIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
    groupId: z.string().min(1).optional(),
    columns: z.array(z.string().min(1)).min(1).max(30),
    format: z.enum(["csv", "xlsx", "pdf"]),
  })
  .refine((value) => Boolean(value.cardIds?.length || value.groupId), {
    message: "Debes indicar tarjetas o un grupo",
  });

const COLUMN_LABELS: Record<string, string> = {
  tc: "TC",
  status: "Status",
  provincia: "Provincia",
  zona: "Zona",
  nombre: "Nombre",
  cedula: "Cedula",
  urgente: "Urgente",
  solicitud: "Solicitud",
  reclamacion: "Reclamacion",
};

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = exportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const { cardIds, groupId, columns, format } = parsed.data;
  const cards = await prisma.card.findMany({
    where: {
      ...(cardIds?.length ? { id: { in: cardIds } } : {}),
      ...(groupId ? { groupMemberships: { some: { groupId } } } : {}),
    },
    select: {
      tc: true,
      status: true,
      provincia: true,
      zona: true,
      urgent: true,
      hadSolicitud: true,
      hadReclamacion: true,
      customer: { select: { nombre: true, cedula: true } },
    },
  });

  if (!cards.length) {
    return NextResponse.json({ error: "No hay datos para exportar" }, { status: 404 });
  }

  const validColumns = columns.filter((column) => column in COLUMN_LABELS);
  if (!validColumns.length) {
    return NextResponse.json({ error: "No se enviaron columnas validas para exportar" }, { status: 400 });
  }

  const exportRows = cards.map((card) => {
    const values: Record<string, unknown> = {
      tc: card.tc,
      status: card.status,
      provincia: card.provincia,
      zona: card.zona,
      nombre: card.customer?.nombre ?? "",
      cedula: card.customer?.cedula ?? "",
      urgente: card.urgent ? "SI" : "NO",
      solicitud: card.hadSolicitud ? "SI" : "NO",
      reclamacion: card.hadReclamacion ? "SI" : "NO",
    };
    return Object.fromEntries(
      validColumns.map((column) => [COLUMN_LABELS[column], values[column] ?? ""]),
    );
  });

  const date = new Date().toISOString().slice(0, 10);
  await writeAuditEvent({
    entity: "URGENT_EXPORT",
    entityId: groupId ?? "selected-cards",
    action: "EXPORT",
    userId: auth.session.user.id,
    details: { format, rowCount: exportRows.length, columns: validColumns },
    request,
  });

  if (format === "csv") {
    return new NextResponse(exportRowsToCsv(exportRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="urgentes-${date}.csv"`,
      },
    });
  }

  if (format === "pdf") {
    const pdf = await exportRowsToPdf("Urgencias", exportRows);
    return new NextResponse(Uint8Array.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="urgentes-${date}.pdf"`,
      },
    });
  }

  const xlsx = await exportRowsToXlsx(exportRows, "Urgencias");
  return new NextResponse(xlsx, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="urgentes-${date}.xlsx"`,
    },
  });
}
