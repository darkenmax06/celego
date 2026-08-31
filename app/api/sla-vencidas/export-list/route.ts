import { NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { displayPhone, displayText } from "@/lib/display";
import { remainingBusinessDays } from "@/lib/sla";
import { exportRowsToCsv, exportRowsToPdf, exportRowsToXlsx } from "@/lib/reports/export";
import { writeAuditEvent } from "@/lib/audit";
import { SLA_CLOSED_STATUSES } from "@/lib/list-query/descriptors/sla-vencidas";

const COLUMN_LABELS = {
  nombre: "Cliente",
  cedula: "Cedula",
  tc: "TC",
  status: "Status",
  slaDueDate: "SLA vence",
  diasVencidos: "Dias vencidos",
  dispatchDate: "Fecha despacho",
  mensajero: "Mensajero",
  provincia: "Provincia",
  zona: "Zona",
  tipoTarjeta: "Tipo tarjeta",
  adicional: "Adicional",
  adicionalNumero: "No adicional",
  direccion: "Direccion",
  telefonos: "Contactos",
} as const;

type ColumnKey = keyof typeof COLUMN_LABELS;

const payloadSchema = z.object({
  messengerId: z.string().optional().default("ALL"),
  columns: z.array(z.enum(Object.keys(COLUMN_LABELS) as [ColumnKey, ...ColumnKey[]])).min(1).max(24),
  format: z.enum(["csv", "xlsx", "pdf"]),
});

function formatDate(value: Date | null) {
  if (!value) return "";
  return value.toLocaleDateString("es-DO");
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const messengerId =
    parsed.data.messengerId && parsed.data.messengerId !== "ALL"
      ? parsed.data.messengerId
      : "ALL";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cards = await prisma.card.findMany({
    where: {
      status: { notIn: [...SLA_CLOSED_STATUSES] },
      slaDueDate: { lt: today },
      ...(messengerId !== "ALL" ? { currentMessengerId: messengerId } : {}),
    },
    select: {
      tc: true,
      status: true,
      provincia: true,
      zona: true,
      isAdditional: true,
      additionalIndex: true,
      dispatchDate: true,
      slaDueDate: true,
      customer: {
        select: {
          nombre: true,
          cedula: true,
          direccionRaw: true,
          telefonosRaw: true,
        },
      },
      currentMessenger: {
        select: {
          nombre: true,
        },
      },
    },
    orderBy: [{ slaDueDate: "asc" }, { updatedAt: "desc" }],
    take: 5000,
  });

  if (!cards.length) {
    return NextResponse.json({ error: "No hay tarjetas con SLA vencida para exportar" }, { status: 404 });
  }

  const rows = cards.map((card) => ({
    nombre: card.customer.nombre,
    cedula: card.customer.cedula,
    tc: card.tc,
    status: card.status,
    slaDueDate: formatDate(card.slaDueDate),
    diasVencidos: Math.abs(Math.min(0, remainingBusinessDays(new Date(), card.slaDueDate ?? today))),
    dispatchDate: formatDate(card.dispatchDate),
    mensajero: displayText(card.currentMessenger?.nombre),
    provincia: card.provincia,
    zona: card.zona,
    tipoTarjeta: card.isAdditional ? "ADICIONAL" : "PRINCIPAL",
    adicional: card.isAdditional ? "SI" : "NO",
    adicionalNumero: card.additionalIndex,
    direccion: displayText(card.customer.direccionRaw),
    telefonos: displayPhone(card.customer.telefonosRaw),
  }));

  const selectedColumns = [...new Set(parsed.data.columns)];
  const exportRows = rows.map((row) => {
    const output: Record<string, unknown> = {};
    for (const column of selectedColumns) {
      output[COLUMN_LABELS[column]] = row[column];
    }
    return output;
  });

  const todayTag = new Date().toISOString().slice(0, 10);
  if (parsed.data.format === "csv") {
    const csv = exportRowsToCsv(exportRows);
    await writeAuditEvent({
      entity: "SLA_EXPORT",
      entityId: todayTag,
      action: "EXPORT",
      userId: auth.session.user.id,
      details: { format: "csv", rowCount: exportRows.length, messengerId },
      request,
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sla-vencidas-listado-${todayTag}.csv"`,
      },
    });
  }

  if (parsed.data.format === "pdf") {
    const pdf = await exportRowsToPdf("SLA vencidas", exportRows);
    await writeAuditEvent({
      entity: "SLA_EXPORT",
      entityId: todayTag,
      action: "EXPORT",
      userId: auth.session.user.id,
      details: { format: "pdf", rowCount: exportRows.length, messengerId },
      request,
    });
    return new NextResponse(Uint8Array.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sla-vencidas-listado-${todayTag}.pdf"`,
      },
    });
  }

  const xlsx = await exportRowsToXlsx(exportRows, "SLA Vencidas");
  await writeAuditEvent({
    entity: "SLA_EXPORT",
    entityId: todayTag,
    action: "EXPORT",
    userId: auth.session.user.id,
    details: { format: "xlsx", rowCount: exportRows.length, messengerId },
    request,
  });
  return new NextResponse(xlsx, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sla-vencidas-listado-${todayTag}.xlsx"`,
    },
  });
}
