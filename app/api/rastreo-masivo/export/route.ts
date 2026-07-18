import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { formatDateEs } from "@/lib/date";
import {
  matchesTrackingToken,
  parseTrackingQueryItems,
  searchTrackingCards,
} from "@/lib/mass-tracking";
import { exportRowsToCsv, exportRowsToPdf, exportRowsToXlsx } from "@/lib/reports/export";
import { writeAuditEvent } from "@/lib/audit";

const exportSchema = z.object({
  query: z.string().min(1).max(50000),
  columns: z.array(z.string().min(1)).min(1).max(30),
  format: z.enum(["csv", "xlsx", "pdf"]),
});

const COLUMN_LABELS: Record<string, string> = {
  tc: "TC",
  externalReference: "Referencia",
  nombre: "Nombre",
  cedula: "Cedula",
  status: "Status",
  provincia: "Provincia",
  zona: "Zona",
  mensajero: "Mensajero",
  fechaDespacho: "Fecha despacho",
  slaVence: "SLA vence",
  urgente: "Urgente",
  remota: "Remota",
  tipoTarjeta: "Tipo tarjeta",
  adicional: "Adicional",
  adicionalNumero: "No adicional",
  tipoEntrega: "Tipo entrega",
  tipoEmision: "Tipo emision",
  telefonos: "Telefonos",
  direccion: "Direccion",
  motivoRetorno: "Motivo retorno",
  matchedBy: "Coincidencias",
};

type OutputRow = {
  tc: string;
  externalReference: string;
  nombre: string;
  cedula: string;
  status: string;
  provincia: string;
  zona: string;
  mensajero: string;
  fechaDespacho: string;
  slaVence: string;
  urgente: string;
  remota: string;
  tipoTarjeta: string;
  adicional: string;
  adicionalNumero: number;
  tipoEntrega: string;
  tipoEmision: string;
  telefonos: string;
  direccion: string;
  motivoRetorno: string;
  matchedBy: string;
  matchScore: number;
  updatedAt: string;
};

function toOutputRow(input: {
  tc: string;
  externalReference: string | null;
  status: string;
  provincia: string;
  zona: string;
  dispatchDate: Date | null;
  slaDueDate: Date | null;
  urgent: boolean;
  isRemote: boolean;
  isAdditional: boolean;
  additionalIndex: number;
  returnReason: string | null;
  deliveryType: string | null;
  emissionType: string | null;
  customer: {
    nombre: string;
    cedula: string;
    telefonosRaw: string | null;
    direccionRaw: string | null;
  };
  currentMessenger: {
    nombre: string;
  } | null;
  updatedAt: Date;
  matchedBy: string[];
}) {
  return {
    tc: input.tc,
    externalReference: input.externalReference ?? "",
    nombre: input.customer.nombre,
    cedula: input.customer.cedula,
    status: input.status,
    provincia: input.provincia,
    zona: input.zona,
    mensajero: input.currentMessenger?.nombre ?? "",
    fechaDespacho: formatDateEs(input.dispatchDate),
    slaVence: formatDateEs(input.slaDueDate),
    urgente: input.urgent ? "SI" : "NO",
    remota: input.isRemote ? "SI" : "NO",
    tipoTarjeta: input.isAdditional ? "ADICIONAL" : "PRINCIPAL",
    adicional: input.isAdditional ? "SI" : "NO",
    adicionalNumero: input.additionalIndex,
    tipoEntrega: input.deliveryType ?? "",
    tipoEmision: input.emissionType ?? "",
    telefonos: input.customer.telefonosRaw ?? "",
    direccion: input.customer.direccionRaw ?? "",
    motivoRetorno: input.returnReason ?? "",
    matchedBy: input.matchedBy.join(", "),
    matchScore: input.matchedBy.length,
    updatedAt: input.updatedAt.toISOString(),
  };
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = exportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const tokens = parseTrackingQueryItems(parsed.data.query);
  if (!tokens.length) {
    return NextResponse.json({ error: "Debes incluir al menos un criterio de busqueda" }, { status: 400 });
  }

  const cards = await searchTrackingCards(tokens);
  const rows = cards
    .map((card) => toOutputRow({
      ...card,
      matchedBy: tokens.filter((token) => matchesTrackingToken(card, token)).slice(0, 8),
    }))
    .sort((a, b) => {
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  if (!rows.length) {
    return NextResponse.json({ error: "No hay datos para exportar" }, { status: 404 });
  }

  const validColumns = parsed.data.columns.filter((column) => column in COLUMN_LABELS);
  if (!validColumns.length) {
    return NextResponse.json({ error: "No se enviaron columnas validas para exportar" }, { status: 400 });
  }

  const exportRows = rows.map((row) => {
    const output: Record<string, unknown> = {};
    for (const column of validColumns) {
      output[COLUMN_LABELS[column]] = row[column as keyof OutputRow] ?? "";
    }
    return output;
  });

  const today = new Date().toISOString().slice(0, 10);
  if (parsed.data.format === "csv") {
    const csv = exportRowsToCsv(exportRows);
    await writeAuditEvent({
      entity: "MASS_TRACKING_EXPORT",
      entityId: today,
      action: "EXPORT",
      userId: auth.session.user.id,
      details: { format: "csv", rowCount: exportRows.length, columns: validColumns },
      request,
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rastreo-masivo-${today}.csv"`,
      },
    });
  }

  if (parsed.data.format === "pdf") {
    const pdf = await exportRowsToPdf("Rastreo masivo", exportRows);
    await writeAuditEvent({
      entity: "MASS_TRACKING_EXPORT",
      entityId: today,
      action: "EXPORT",
      userId: auth.session.user.id,
      details: { format: "pdf", rowCount: exportRows.length, columns: validColumns },
      request,
    });
    return new NextResponse(Uint8Array.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rastreo-masivo-${today}.pdf"`,
      },
    });
  }

  const xlsx = await exportRowsToXlsx(exportRows, "Rastreo");
  await writeAuditEvent({
    entity: "MASS_TRACKING_EXPORT",
    entityId: today,
    action: "EXPORT",
    userId: auth.session.user.id,
    details: { format: "xlsx", rowCount: exportRows.length, columns: validColumns },
    request,
  });
  return new NextResponse(xlsx, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rastreo-masivo-${today}.xlsx"`,
    },
  });
}
