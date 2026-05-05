import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import sharp from "sharp";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { formatCurrencyDOP } from "@/lib/money";

const FONT_FAMILY = "DejaVu Sans, Noto Sans, Liberation Sans, sans-serif";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dateLabel(value: Date | string) {
  return new Date(value).toLocaleDateString("es-DO");
}

function buildMessengerReportSvg(input: {
  messengerName: string;
  from: string;
  to: string;
  rows: Array<{
    fecha: string;
    entregasNormales: number;
    entregasRemotas: number;
    recogidasBanco: number;
    mandados: number;
    totalCents: number;
  }>;
}) {
  const bodyRows = input.rows.slice(0, 28);
  const totalCents = input.rows.reduce((sum, row) => sum + row.totalCents, 0);
  const totals = input.rows.reduce(
    (acc, row) => ({
      entregasNormales: acc.entregasNormales + row.entregasNormales,
      entregasRemotas: acc.entregasRemotas + row.entregasRemotas,
      recogidasBanco: acc.recogidasBanco + row.recogidasBanco,
      mandados: acc.mandados + row.mandados,
    }),
    { entregasNormales: 0, entregasRemotas: 0, recogidasBanco: 0, mandados: 0 },
  );
  const height = 396 + bodyRows.length * 28;

  let y = 175;
  const rowSvg = bodyRows
    .map((row) => {
      const current = y;
      y += 28;
      return `
      <text x="60" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${escapeXml(dateLabel(row.fecha))}</text>
      <text x="220" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${row.entregasNormales}</text>
      <text x="330" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${row.entregasRemotas}</text>
      <text x="450" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${row.recogidasBanco}</text>
      <text x="580" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${row.mandados}</text>
      <text x="700" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#0f172a">${escapeXml(formatCurrencyDOP(row.totalCents))}</text>
      <line x1="50" y1="${current + 10}" x2="960" y2="${current + 10}" stroke="#e2e8f0" />
      `;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}">
  <rect x="0" y="0" width="1000" height="${height}" fill="#f1f5f9"/>
  <rect x="24" y="24" width="952" height="${height - 48}" rx="16" fill="#ffffff"/>
  <text x="52" y="72" font-size="28" font-family="${FONT_FAMILY}" fill="#0f2544" font-weight="700">${escapeXml(input.messengerName)}</text>
  <text x="52" y="100" font-size="14" font-family="${FONT_FAMILY}" fill="#64748b">Reporte de gestion del ${escapeXml(input.from)} al ${escapeXml(input.to)}</text>
  <rect x="52" y="116" width="896" height="44" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="60" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Fecha</text>
  <text x="220" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Normales</text>
  <text x="330" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Remotas</text>
  <text x="450" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Recogidas</text>
  <text x="580" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Mandados</text>
  <text x="700" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Total</text>
  ${rowSvg}
  <rect x="52" y="${height - 160}" width="896" height="62" rx="10" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="66" y="${height - 137}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155" font-weight="700">TOTAL ENTREGAS POR TIPO</text>
  <text x="66" y="${height - 109}" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Normales</text>
  <text x="220" y="${height - 109}" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Remotas</text>
  <text x="360" y="${height - 109}" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Recogidas</text>
  <text x="520" y="${height - 109}" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Mandados</text>
  <text x="66" y="${height - 100}" font-size="18" font-family="${FONT_FAMILY}" fill="#0f172a" font-weight="700">${totals.entregasNormales}</text>
  <text x="220" y="${height - 100}" font-size="18" font-family="${FONT_FAMILY}" fill="#0f172a" font-weight="700">${totals.entregasRemotas}</text>
  <text x="360" y="${height - 100}" font-size="18" font-family="${FONT_FAMILY}" fill="#0f172a" font-weight="700">${totals.recogidasBanco}</text>
  <text x="520" y="${height - 100}" font-size="18" font-family="${FONT_FAMILY}" fill="#0f172a" font-weight="700">${totals.mandados}</text>
  <rect x="52" y="${height - 92}" width="896" height="48" rx="10" fill="#0f172a"/>
  <text x="66" y="${height - 63}" font-size="12" font-family="${FONT_FAMILY}" fill="#cbd5e1">TOTAL DEL PERIODO</text>
  <text x="860" y="${height - 60}" text-anchor="end" font-size="24" font-family="${FONT_FAMILY}" fill="#22c55e" font-weight="700">${escapeXml(formatCurrencyDOP(totalCents))}</text>
</svg>`;
}

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
      orderBy: { fecha: "asc" },
    });

    const svg = buildMessengerReportSvg({
      messengerName: messenger.nombre,
      from,
      to,
      rows: rows.map((row) => ({
        fecha: row.fecha.toISOString(),
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
    orderBy: [{ messengerId: "asc" }, { fecha: "asc" }],
  });

  const zip = new JSZip();

  for (const messenger of messengers) {
    const rows = records
      .filter((record) => record.messengerId === messenger.id)
      .map((row) => ({
        fecha: row.fecha.toISOString(),
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
