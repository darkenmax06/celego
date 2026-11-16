import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { buildMessengerReportSvg } from "@/lib/payroll/report-image";
import { PayrollError } from "@/lib/payroll/payments";
import { renderPeriodReport, svgToJpeg } from "@/lib/payroll/period-report";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const mode = request.nextUrl.searchParams.get("mode") ?? "single";
  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const periodId = request.nextUrl.searchParams.get("periodId");

  if (mode === "single" && periodId && messengerId) {
    return periodPaymentImage(messengerId, periodId);
  }

  if (!from || !to) {
    return NextResponse.json({ error: "from y to son requeridos" }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (mode === "single") {
    if (!messengerId) {
      return NextResponse.json({ error: "messengerId es requerido para modo single" }, { status: 400 });
    }

    const messenger = await prisma.messenger.findUnique({ where: { id: messengerId } });
    if (!messenger) {
      return NextResponse.json({ error: "Mensajero no encontrado" }, { status: 404 });
    }

    const rows = await prisma.messengerDailyRecord.findMany({
      where: {
        messengerId,
        fecha: { gte: fromDate, lte: toDate },
      },
      orderBy: [{ fecha: "asc" }, { siguienteCorte: "asc" }],
    });

    const svg = buildMessengerReportSvg({
      messengerName: messenger.nombre,
      from,
      to,
      rows: rows.map((row) => ({
        fecha: row.fecha.toISOString(),
        note: row.siguienteCorte ? "restantes tras el corte" : undefined,
        entregasNormales: row.entregasNormales,
        entregasRemotas: row.entregasRemotas,
        recogidasBanco: row.recogidasBanco,
        mandados: row.mandados,
        totalCents: row.totalCents,
      })),
    });
    const jpg = await svgToJpeg(svg);
    const jpgBody = Uint8Array.from(jpg);

    return new NextResponse(jpgBody, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="reporte-${messenger.nombre.replace(/\s+/g, "_")}-${from}-${to}.jpg"`,
      },
    });
  }

  const messengers = await prisma.messenger.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });

  const records = await prisma.messengerDailyRecord.findMany({
    where: {
      fecha: { gte: fromDate, lte: toDate },
      messengerId: { in: messengers.map((messenger) => messenger.id) },
    },
    orderBy: [{ messengerId: "asc" }, { fecha: "asc" }, { siguienteCorte: "asc" }],
  });

  const zip = new JSZip();

  for (const messenger of messengers) {
    const rows = records
      .filter((record) => record.messengerId === messenger.id)
      .map((row) => ({
        fecha: row.fecha.toISOString(),
        note: row.siguienteCorte ? "restantes tras el corte" : undefined,
        entregasNormales: row.entregasNormales,
        entregasRemotas: row.entregasRemotas,
        recogidasBanco: row.recogidasBanco,
        mandados: row.mandados,
        totalCents: row.totalCents,
      }));

    const svg = buildMessengerReportSvg({
      messengerName: messenger.nombre,
      from,
      to,
      rows,
    });
    const jpg = await svgToJpeg(svg);

    const filename = `${messenger.nombre.replace(/\s+/g, "_")}-${from}-${to}.jpg`;
    zip.file(filename, jpg);
  }

  const zipContent = await zip.generateAsync({ type: "arraybuffer" });
  return new NextResponse(zipContent, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="reportes-mensajeros-${from}-${to}.zip"`,
    },
  });
}

/** Preview of a period payment image (provisional while the period is open); nothing is stored. */
async function periodPaymentImage(messengerId: string, periodId: string) {
  try {
    const report = await renderPeriodReport(messengerId, periodId);
    return new NextResponse(Uint8Array.from(report.jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="${report.fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof PayrollError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
