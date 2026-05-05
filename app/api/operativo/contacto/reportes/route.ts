import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import sharp from "sharp";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const FONT_FAMILY = "DejaVu Sans, Noto Sans, Liberation Sans, Arial, sans-serif";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeFilePart(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "SIN_NOMBRE";
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString("es-DO");
}

function splitPhones(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(/[,\n;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCardSvg(input: {
  cliente: string;
  tc: string;
  cedula: string;
  provincia: string;
  zona: string;
  status: string;
  direccion: string;
  telefonos: string[];
  comentario: string;
  dateLabel: string;
}) {
  const phones = input.telefonos.length ? input.telefonos.join(" - ") : "-";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f2544" />
      <stop offset="100%" stop-color="#1a3a66" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1280" height="720" fill="url(#bg)"/>
  <rect x="32" y="32" width="1216" height="656" rx="18" fill="#ffffff"/>

  <text x="72" y="92" font-family="${FONT_FAMILY}" font-size="32" fill="#0f2544" font-weight="700">${escapeXml(input.cliente)}</text>
  <text x="72" y="124" font-family="${FONT_FAMILY}" font-size="17" fill="#64748b">TC ${escapeXml(input.tc)} · Cédula ${escapeXml(input.cedula)}</text>

  <rect x="72" y="154" width="1136" height="64" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="92" y="183" font-family="${FONT_FAMILY}" font-size="13" fill="#64748b">Provincia</text>
  <text x="92" y="206" font-family="${FONT_FAMILY}" font-size="17" fill="#0f172a" font-weight="600">${escapeXml(input.provincia)}</text>
  <text x="430" y="183" font-family="${FONT_FAMILY}" font-size="13" fill="#64748b">Zona</text>
  <text x="430" y="206" font-family="${FONT_FAMILY}" font-size="17" fill="#0f172a" font-weight="600">${escapeXml(input.zona)}</text>
  <text x="700" y="183" font-family="${FONT_FAMILY}" font-size="13" fill="#64748b">Estatus</text>
  <text x="700" y="206" font-family="${FONT_FAMILY}" font-size="17" fill="#0f172a" font-weight="600">${escapeXml(input.status)}</text>
  <text x="970" y="183" font-family="${FONT_FAMILY}" font-size="13" fill="#64748b">Fecha operativo</text>
  <text x="970" y="206" font-family="${FONT_FAMILY}" font-size="17" fill="#0f172a" font-weight="600">${escapeXml(input.dateLabel)}</text>

  <text x="72" y="264" font-family="${FONT_FAMILY}" font-size="13" fill="#64748b">Teléfonos</text>
  <rect x="72" y="276" width="1136" height="58" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="90" y="312" font-family="${FONT_FAMILY}" font-size="18" fill="#0f172a">${escapeXml(phones).slice(0, 150)}</text>

  <text x="72" y="376" font-family="${FONT_FAMILY}" font-size="13" fill="#64748b">Dirección</text>
  <rect x="72" y="388" width="1136" height="112" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="90" y="420" font-family="${FONT_FAMILY}" font-size="16" fill="#334155">${escapeXml(input.direccion || "-").slice(0, 220)}</text>

  <text x="72" y="544" font-family="${FONT_FAMILY}" font-size="13" fill="#64748b">Comentario operativo</text>
  <rect x="72" y="556" width="1136" height="88" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="90" y="592" font-family="${FONT_FAMILY}" font-size="16" fill="#334155">${escapeXml(input.comentario || "-").slice(0, 260)}</text>
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

  const date = request.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date es requerido" }, { status: 400 });
  }

  const start = new Date(date);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "date invalida" }, { status: 400 });
  }
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const logs = await prisma.contactLog.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      contactado: true,
    },
    include: {
      card: {
        include: { customer: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10000,
  });

  const latestByCard = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    if (!latestByCard.has(log.cardId)) {
      latestByCard.set(log.cardId, log);
    }
  }

  const rows = Array.from(latestByCard.values());
  if (!rows.length) {
    return NextResponse.json(
      { error: "No hay tarjetas contactadas para la fecha seleccionada" },
      { status: 404 },
    );
  }

  const zip = new JSZip();
  const dateLabel = formatDateLabel(start);

  for (const row of rows) {
    const provinceName = sanitizeFilePart(row.card.provincia || "SIN_PROVINCIA");
    const folder = zip.folder(provinceName);
    if (!folder) continue;

    const svg = buildCardSvg({
      cliente: row.card.customer.nombre,
      tc: row.card.tc,
      cedula: row.card.customer.cedula,
      provincia: row.card.provincia,
      zona: row.card.zona,
      status: row.card.status.replaceAll("_", " "),
      direccion: row.card.customer.direccionRaw ?? "",
      telefonos: splitPhones(row.telefonosUsados || row.card.customer.telefonosRaw),
      comentario: row.comentario ?? "",
      dateLabel,
    });
    const jpg = await svgToJpeg(svg);
    const fileName = `${sanitizeFilePart(row.card.customer.nombre)} - ${sanitizeFilePart(row.card.tc)}.jpg`;
    folder.file(fileName, jpg);
  }

  const zipContent = await zip.generateAsync({ type: "arraybuffer" });
  return new NextResponse(zipContent, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="operativo-${date}.zip"`,
    },
  });
}
