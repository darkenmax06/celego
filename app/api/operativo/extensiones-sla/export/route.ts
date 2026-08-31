import { NextResponse } from "next/server";
import { SLAExtensionRequestStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { exportRowsToCsv, exportRowsToPdf, exportRowsToXlsx } from "@/lib/reports/export";

const payloadSchema = z.object({
  status: z.string().optional().default("ALL"),
  provincia: z.string().optional().default("ALL"),
  format: z.enum(["csv", "xlsx", "pdf"]),
});

function formatDate(date: Date | string | null) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-DO");
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const { status, provincia, format } = parsed.data;

  const requests = await prisma.sLAExtensionRequest.findMany({
    where: {
      ...(status && status !== "ALL" ? { status: status as SLAExtensionRequestStatus } : {}),
      ...(provincia && provincia !== "ALL"
        ? {
            OR: [{ provinciaOrigen: provincia }, { provinciaDestino: provincia }],
          }
        : {}),
    },
    include: {
      card: {
        select: {
          status: true,
          slaDueDate: true,
          currentMessenger: { select: { nombre: true } },
        },
      },
      solicitadoPor: { select: { name: true } },
      aprobadoPor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  if (!requests.length) {
    return NextResponse.json({ error: "No hay solicitudes para exportar" }, { status: 404 });
  }

  const exportRows = requests.map((item, index) => ({
    No: index + 1,
    TC: item.tc,
    Cedula: item.cedula,
    Cliente: item.nombre,
    "Provincia Origen": item.provinciaOrigen,
    "Provincia Destino": item.provinciaDestino || "-",
    "Motivo de Extension": item.motivo,
    "Dias Solicitados": item.diasSolicitados,
    Estado: item.status,
    "Status Tarjeta": item.card?.status || "-",
    "SLA Actual": formatDate(item.card?.slaDueDate ?? null),
    Mensajero: item.card?.currentMessenger?.nombre || "Sin asignar",
    "Solicitado Por": item.solicitadoPor?.name || "Operador",
    "Fecha Solicitud": formatDate(item.createdAt),
  }));

  if (format === "csv") {
    const csv = exportRowsToCsv(exportRows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="solicitudes-extension-sla.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const buffer = await exportRowsToXlsx(exportRows, "Extensiones SLA");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="solicitudes-extension-sla.xlsx"`,
      },
    });
  }

  const pdfBuffer = await exportRowsToPdf("SOLICITUDES DE EXTENSIÓN DE SLA - BANCO", exportRows);
  return new NextResponse(Buffer.from(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="solicitudes-extension-sla.pdf"`,
    },
  });
}
