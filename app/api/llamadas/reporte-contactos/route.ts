import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { exportRowsToCsv, exportRowsToXlsx } from "@/lib/reports/export";
import { ASIGNADO_PARAM, buildAsignadoWhere } from "@/lib/call-assignment";
import { CONTACT_RESULTADOS, type PhoneCallDetail } from "@/lib/contact-call";
import { buildContactReportRow } from "@/lib/contact-report";
import { splitPhonesFromRaw } from "@/lib/operativo-row";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(raw: string | null, endOfDay: boolean): Date | null {
  const match = raw?.trim().match(DATE_PATTERN);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function toPhoneDetails(value: Prisma.JsonValue | null): PhoneCallDetail[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is Prisma.JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      numero: typeof item.numero === "string" ? item.numero : "",
      estado: typeof item.estado === "string" ? item.estado : null,
      nota: typeof item.nota === "string" ? item.nota : null,
    }));
}

/**
 * GET /api/llamadas/reporte-contactos?from=YYYY-MM-DD&to=YYYY-MM-DD&format=xlsx|csv&resultado=&asignado=&canal=
 *
 * One row per card: its most recent ContactLog inside [from, to] that matches
 * the filters. `resultado` defaults to CONTACTADA (legacy logs without
 * `resultado` count as CONTACTADA when `contactado` is true); pass
 * `resultado=ALL` to take the latest log regardless of outcome.
 * `asignado` = ME | SIN_ASIGNAR | userId; `canal` = WHATSAPP | LLAMADA_DIRECTA.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const params = request.nextUrl.searchParams;
  const fromRaw = params.get("from")?.trim() ?? "";
  const toRaw = params.get("to")?.trim() ?? "";
  const fromDate = parseDay(fromRaw, false);
  const toDate = parseDay(toRaw, true);
  if (!fromDate || !toDate || fromDate > toDate) {
    return NextResponse.json(
      { error: "Rango de fechas inválido (use from y to con formato YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const format = params.get("format") === "csv" ? "csv" : "xlsx";
  const resultadoParam = params.get("resultado")?.trim() || "CONTACTADA";
  if (resultadoParam !== "ALL" && !(CONTACT_RESULTADOS as readonly string[]).includes(resultadoParam)) {
    return NextResponse.json({ error: "Resultado inválido" }, { status: 400 });
  }
  const canal = params.get("canal")?.trim();
  if (canal && canal !== "ALL" && canal !== "WHATSAPP" && canal !== "LLAMADA_DIRECTA") {
    return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
  }
  const asignadoWhere = buildAsignadoWhere(params.get(ASIGNADO_PARAM), auth.session.user.id);

  const resultadoWhere: Prisma.ContactLogWhereInput | undefined =
    resultadoParam === "ALL"
      ? undefined
      : resultadoParam === "CONTACTADA"
        ? { OR: [{ resultado: "CONTACTADA" }, { resultado: null, contactado: true }] }
        : resultadoParam === "NO_CONTACTADA"
          ? { OR: [{ resultado: "NO_CONTACTADA" }, { resultado: null, contactado: false }] }
          : { resultado: resultadoParam };

  const where: Prisma.ContactLogWhereInput = {
    AND: [
      { createdAt: { gte: fromDate, lte: toDate } },
      ...(resultadoWhere ? [resultadoWhere] : []),
      ...(canal && canal !== "ALL" ? [{ canalContacto: canal }] : []),
      ...(asignadoWhere ? [{ card: asignadoWhere }] : []),
    ],
  };

  const logs = await prisma.contactLog.findMany({
    where,
    distinct: ["cardId"],
    orderBy: [{ cardId: "asc" }, { createdAt: "desc" }],
    take: 10000,
    include: {
      user: { select: { name: true } },
      card: {
        select: {
          tc: true,
          productType: true,
          provincia: true,
          zona: true,
          customer: { select: { nombre: true, cedula: true, direccionRaw: true, telefonosRaw: true } },
          currentMessenger: { select: { nombre: true, telefono: true } },
        },
      },
    },
  });

  logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const rows = logs.map((log) =>
    buildContactReportRow({
      createdAt: log.createdAt,
      operador: log.user?.name ?? null,
      tc: log.card.tc,
      cliente: log.card.customer.nombre,
      cedula: log.card.customer.cedula,
      productType: log.card.productType,
      provincia: log.card.provincia,
      zona: log.card.zona,
      cardDireccion: log.card.customer.direccionRaw,
      nuevaDireccion: log.nuevaDireccion,
      telefonosDetalle: toPhoneDetails(log.telefonosDetalle),
      telefonosUsados: log.telefonosUsados,
      telefonoPrincipal: splitPhonesFromRaw(log.card.customer.telefonosRaw)[0] ?? null,
      canalContacto: log.canalContacto,
      fechaPreferenciaEntrega: log.fechaPreferenciaEntrega,
      mensajero: log.card.currentMessenger?.nombre ?? null,
      mensajeroTelefono: log.card.currentMessenger?.telefono ?? null,
      resultado: log.resultado ?? (log.contactado ? "CONTACTADA" : "NO_CONTACTADA"),
      comentario: log.comentario,
    }),
  );

  const filename = `reporte-contactos-${fromRaw}-${toRaw}.${format}`;
  if (format === "csv") {
    // BOM so Excel opens accented Spanish headers correctly.
    return new NextResponse(`﻿${exportRowsToCsv(rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buffer = await exportRowsToXlsx(rows, "Reporte de contactos");
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
