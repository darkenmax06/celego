import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import sharp from "sharp";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { formatCurrencyDOP } from "@/lib/money";
import { buildMessengerReportSvg, dateLabel } from "@/lib/payroll/report-image";
import { countedBetween } from "@/lib/payroll/counting";
import { openPayment } from "@/lib/payroll/payments";

async function svgToJpeg(svg: string) {
  return sharp(Buffer.from(svg))
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

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

/**
 * Payment image of one period: the days that count for it (including what was
 * delivered after the previous cut), the loan installments taken off and the net.
 */
async function periodPaymentImage(messengerId: string, periodId: string) {
  const [messenger, period] = await Promise.all([
    prisma.messenger.findUnique({ where: { id: messengerId } }),
    prisma.payrollPeriod.findUnique({ where: { id: periodId } }),
  ]);
  if (!messenger) return NextResponse.json({ error: "Mensajero no encontrado" }, { status: 404 });
  if (!period || (period.messengerId && period.messengerId !== messengerId)) {
    return NextResponse.json({ error: "Periodo no encontrado para este mensajero" }, { status: 404 });
  }

  const [payment, rows] = await Promise.all([
    prisma.$transaction((tx) => openPayment(tx, messengerId, periodId)),
    prisma.messengerDailyRecord.findMany({
      where: { messengerId, ...countedBetween(period.fromDate, period.toDate) },
      orderBy: [{ fecha: "asc" }, { siguienteCorte: "asc" }],
    }),
  ]);

  const svg = buildMessengerReportSvg({
    messengerName: messenger.nombre,
    title: `Pago ${period.label}`,
    from: dateLabel(period.fromDate),
    to: dateLabel(period.toDate),
    payment: {
      netCents: payment.netCents,
      deductions: payment.installments
        .filter((item) => item.status !== "OMITIDA")
        .map((item) => ({
          label: `Prestamo ${formatCurrencyDOP(item.loan.principalCents)} - cuota ${item.number}/${item.loan.installmentCount}${item.loan.note ? ` (${item.loan.note})` : ""}`,
          cents: item.appliedCents ?? item.plannedCents,
        })),
    },
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
  const jpg = Uint8Array.from(await svgToJpeg(svg));
  const name = `${messenger.nombre}-${period.label}`.replace(/[^\w.-]+/g, "_");
  return new NextResponse(jpg, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="pago-${name}.jpg"`,
    },
  });
}
