import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";
import { exportRowsToCsv, exportRowsToPdf, exportRowsToXlsx } from "@/lib/reports/export";
import { ListQueryValidationError } from "@/lib/list-query";
import { compileSlaVencidasQuery, readSlaOperativo, serializeSlaCard } from "../shared";

const COLUMN_LABELS = {
  producto: "Producto", identificador: "Identificador", tc: "TC", numeroTarjeta: "Numero tarjeta", numeroSolicitud: "Numero solicitud",
  nombre: "Cliente", cedula: "Cedula", contactoEstado: "Gestion contacto", status: "Status", slaDueDate: "SLA vence", diasRestantes: "Dias restantes",
  diasVencidos: "Dias vencidos", dispatchDate: "Fecha despacho", mensajero: "Mensajero", provincia: "Provincia", zona: "Zona",
  tipoTarjeta: "Tipo tarjeta", adicional: "Adicional", urgente: "Urgente", direccion: "Direccion", telefonos: "Contactos",
} as const;
type ColumnKey = keyof typeof COLUMN_LABELS;

const CONTACTO_LABELS: Record<string, string> = {
  CONTACTADA: "Contactada", NO_CONTACTADA: "No contactada",
  RETORNO_SOLICITADO: "Retorno solicitado", TRASLADO_SOLICITADO: "Traslado solicitado",
};

const payloadSchema = z.object({
  /** Same query string the list view sends to `GET /api/sla-vencidas` (pagination is ignored). */
  params: z.string().max(8000).optional().default(""),
  columns: z.array(z.enum(Object.keys(COLUMN_LABELS) as [ColumnKey, ...ColumnKey[]])).min(1).max(32),
  format: z.enum(["csv", "xlsx", "pdf"]),
});

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("es-DO") : "";
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;
  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload invalido" }, { status: 400 });

  const input = parsed.data;
  const searchParams = new URLSearchParams(input.params);
  // Export every matching card, not just the visible page.
  searchParams.delete("page");
  searchParams.delete("pageSize");
  let compiled;
  try {
    compiled = await compileSlaVencidasQuery(searchParams, auth.session.user.id);
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const cards = await prisma.card.findMany({
    where: compiled.where,
    select: {
      id: true, tc: true, requestNumber: true, productType: true, status: true, slaDueDate: true, dispatchDate: true,
      provincia: true, zona: true, urgent: true, isAdditional: true, additionalIndex: true, metadata: true,
      customer: { select: { nombre: true, cedula: true, direccionRaw: true, telefonosRaw: true } },
      currentMessenger: { select: { id: true, nombre: true } }, lastAssignedMessenger: { select: { id: true, nombre: true } },
    },
    orderBy: compiled.orderBy,
  });
  const rows = cards.map((raw) => {
    const card = serializeSlaCard(raw);
    return {
      producto: card.productType, identificador: card.identifier, tc: card.tc, numeroTarjeta: card.tc, numeroSolicitud: card.requestNumber,
      nombre: card.nombre, cedula: card.cedula, contactoEstado: CONTACTO_LABELS[readSlaOperativo(raw.metadata).contactoEstado],
      status: card.status, slaDueDate: formatDate(card.slaDueDate),
      diasRestantes: card.diasRestantes ?? "", diasVencidos: card.diasVencidos, dispatchDate: formatDate(card.dispatchDate),
      mensajero: card.mensajero, provincia: card.provincia, zona: card.zona, tipoTarjeta: card.tipoTarjeta,
      adicional: card.adicional ? `ADIC. ${card.adicionalNumero}` : "PRINCIPAL",
      urgente: card.urgent ? "SI" : "NO", direccion: card.direccion, telefonos: card.telefonos,
    };
  });
  if (!rows.length) return NextResponse.json({ error: "No hay tarjetas para exportar" }, { status: 404 });
  const selected = [...new Set(input.columns)];
  const exportRows = rows.map((row) => Object.fromEntries(selected.map((column) => [COLUMN_LABELS[column], row[column]])));
  const dateTag = new Date().toISOString().slice(0, 10);
  const title = "Vencimientos vencidos";
  await writeAuditEvent({ entity: "SLA_EXPORT", entityId: dateTag, action: "EXPORT", userId: auth.session.user.id, details: { format: input.format, rowCount: exportRows.length, params: searchParams.toString() }, request });
  const extension = input.format;
  const content = input.format === "csv"
    ? exportRowsToCsv(exportRows)
    : input.format === "pdf"
      ? await exportRowsToPdf(title, exportRows)
      : await exportRowsToXlsx(exportRows, title);
  const body = typeof content === "string" ? content : new Uint8Array(content);
  return new NextResponse(body, {
    headers: {
      "Content-Type": input.format === "csv" ? "text/csv; charset=utf-8" : input.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="vencimientos-overdue-${dateTag}.${extension}"`,
    },
  });
}
