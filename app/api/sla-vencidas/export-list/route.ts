import { NextResponse } from "next/server";
import { CardProductType, CardStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";
import { exportRowsToCsv, exportRowsToPdf, exportRowsToXlsx } from "@/lib/reports/export";
import { isUpcomingWithinWarning, serializeSlaCard, slaWhere, type SlaTab } from "../shared";

const COLUMN_LABELS = {
  producto: "Producto", identificador: "Identificador", numeroTarjeta: "Numero tarjeta", numeroSolicitud: "Numero solicitud",
  nombre: "Cliente", cedula: "Cedula", status: "Status", slaDueDate: "SLA vence", diasRestantes: "Dias restantes",
  diasVencidos: "Dias vencidos", dispatchDate: "Fecha despacho", mensajero: "Mensajero", provincia: "Provincia", zona: "Zona",
  tipoTarjeta: "Tipo tarjeta", urgente: "Urgente", direccion: "Direccion", telefonos: "Contactos",
} as const;
type ColumnKey = keyof typeof COLUMN_LABELS;

const payloadSchema = z.object({
  tab: z.enum(["UPCOMING", "OVERDUE"]).default("OVERDUE"),
  productType: z.nativeEnum(CardProductType).optional(),
  messengerId: z.string().optional().default("ALL"),
  provincia: z.string().optional(), zona: z.string().optional(), status: z.nativeEnum(CardStatus).optional(), q: z.string().optional(),
  columns: z.array(z.enum(Object.keys(COLUMN_LABELS) as [ColumnKey, ...ColumnKey[]])).min(1).max(24),
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
  const filters = {
    tab: input.tab as SlaTab,
    productType: input.productType,
    messengerId: input.messengerId !== "ALL" ? input.messengerId : undefined,
    provincia: input.provincia || undefined, zona: input.zona || undefined, status: input.status, q: input.q || undefined,
  };
  const [config, cards] = await Promise.all([
    prisma.sLAConfig.findUnique({ where: { id: "default" }, select: { warningBusinessDays: true } }),
    prisma.card.findMany({
      where: slaWhere(filters),
      select: {
        id: true, tc: true, requestNumber: true, productType: true, status: true, slaDueDate: true, dispatchDate: true,
        provincia: true, zona: true, urgent: true, isAdditional: true, additionalIndex: true,
        customer: { select: { nombre: true, cedula: true, direccionRaw: true, telefonosRaw: true } },
        currentMessenger: { select: { id: true, nombre: true } }, lastAssignedMessenger: { select: { id: true, nombre: true } },
      },
      orderBy: [{ slaDueDate: "asc" }, { updatedAt: "desc" }],
    }),
  ]);
  const warning = config?.warningBusinessDays ?? 3;
  const rows = cards.map(serializeSlaCard).filter((card) =>
    input.tab !== "UPCOMING" || isUpcomingWithinWarning(card.slaDueDate ? new Date(card.slaDueDate) : null, warning),
  ).map((card) => ({
    producto: card.productType, identificador: card.identifier, numeroTarjeta: card.tc, numeroSolicitud: card.requestNumber,
    nombre: card.nombre, cedula: card.cedula, status: card.status, slaDueDate: formatDate(card.slaDueDate),
    diasRestantes: card.diasRestantes ?? "", diasVencidos: card.diasVencidos, dispatchDate: formatDate(card.dispatchDate),
    mensajero: card.mensajero, provincia: card.provincia, zona: card.zona, tipoTarjeta: card.tipoTarjeta,
    urgente: card.urgent ? "SI" : "NO", direccion: card.direccion, telefonos: card.telefonos,
  }));
  if (!rows.length) return NextResponse.json({ error: "No hay tarjetas para exportar" }, { status: 404 });
  const selected = [...new Set(input.columns)];
  const exportRows = rows.map((row) => Object.fromEntries(selected.map((column) => [COLUMN_LABELS[column], row[column]])));
  const dateTag = new Date().toISOString().slice(0, 10);
  const title = input.tab === "UPCOMING" ? "Vencimientos proximos" : "Vencimientos vencidos";
  await writeAuditEvent({ entity: "SLA_EXPORT", entityId: dateTag, action: "EXPORT", userId: auth.session.user.id, details: { format: input.format, rowCount: exportRows.length, tab: input.tab, productType: input.productType ?? "ALL" }, request });
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
      "Content-Disposition": `attachment; filename="vencimientos-${input.tab.toLowerCase()}-${dateTag}.${extension}"`,
    },
  });
}
