import { NextRequest, NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import JSZip from "jszip";
import sharp from "sharp";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { displayText } from "@/lib/display";
import { remainingBusinessDays } from "@/lib/sla";
import { SLA_CLOSED_STATUSES } from "@/lib/list-query/descriptors/sla-vencidas";

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

function splitPhones(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(/[,\n;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: Date | null) {
  if (!value) return "-";
  return value.toLocaleDateString("es-DO");
}

function buildSlaSvg(input: {
  nombre: string;
  cedula: string;
  tc: string;
  provincia: string;
  status: string;
  mensajero: string;
  slaDate: string;
  diasVencidos: number;
  direccion: string;
  telefonos: string[];
}) {
  const phones = input.telefonos.length ? input.telefonos.join(" - ") : "-";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="820">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7f1d1d" />
      <stop offset="100%" stop-color="#b91c1c" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1400" height="820" fill="url(#bg)"/>
  <rect x="40" y="40" width="1320" height="740" rx="22" fill="#ffffff"/>

  <text x="80" y="110" font-size="36" font-family="DejaVu Sans, Arial, sans-serif" fill="#7f1d1d" font-weight="700">${escapeXml(input.nombre)}</text>
  <text x="80" y="145" font-size="18" font-family="DejaVu Sans, Arial, sans-serif" fill="#475569">TC ${escapeXml(input.tc)} · Cedula ${escapeXml(input.cedula)}</text>

  <rect x="80" y="178" width="1240" height="90" rx="12" fill="#fff1f2" stroke="#fecdd3"/>
  <text x="100" y="210" font-size="13" font-family="DejaVu Sans, Arial, sans-serif" fill="#9f1239">SLA vencida</text>
  <text x="100" y="240" font-size="30" font-family="DejaVu Sans, Arial, sans-serif" fill="#9f1239" font-weight="700">${input.diasVencidos} dia(s)</text>

  <text x="370" y="210" font-size="13" font-family="DejaVu Sans, Arial, sans-serif" fill="#64748b">Fecha SLA</text>
  <text x="370" y="240" font-size="20" font-family="DejaVu Sans, Arial, sans-serif" fill="#0f172a" font-weight="600">${escapeXml(input.slaDate)}</text>

  <text x="620" y="210" font-size="13" font-family="DejaVu Sans, Arial, sans-serif" fill="#64748b">Provincia</text>
  <text x="620" y="240" font-size="20" font-family="DejaVu Sans, Arial, sans-serif" fill="#0f172a" font-weight="600">${escapeXml(input.provincia)}</text>

  <text x="900" y="210" font-size="13" font-family="DejaVu Sans, Arial, sans-serif" fill="#64748b">Estatus</text>
  <text x="900" y="240" font-size="20" font-family="DejaVu Sans, Arial, sans-serif" fill="#0f172a" font-weight="600">${escapeXml(input.status)}</text>

  <text x="1100" y="210" font-size="13" font-family="DejaVu Sans, Arial, sans-serif" fill="#64748b">Mensajero</text>
  <text x="1100" y="240" font-size="20" font-family="DejaVu Sans, Arial, sans-serif" fill="#0f172a" font-weight="600">${escapeXml(input.mensajero || "SIN ASIGNAR")}</text>

  <text x="80" y="320" font-size="13" font-family="DejaVu Sans, Arial, sans-serif" fill="#64748b">Direccion</text>
  <rect x="80" y="334" width="1240" height="170" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="100" y="370" font-size="18" font-family="DejaVu Sans, Arial, sans-serif" fill="#334155">${escapeXml(input.direccion || "-").slice(0, 280)}</text>

  <text x="80" y="550" font-size="13" font-family="DejaVu Sans, Arial, sans-serif" fill="#64748b">Contactos</text>
  <rect x="80" y="564" width="1240" height="90" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="100" y="618" font-size="22" font-family="DejaVu Sans, Arial, sans-serif" fill="#0f172a">${escapeXml(phones).slice(0, 180)}</text>
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

  const messengerId = request.nextUrl.searchParams.get("messengerId");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cards = await prisma.card.findMany({
    where: {
      status: { notIn: [...SLA_CLOSED_STATUSES] },
      slaDueDate: { lt: today },
      ...(messengerId && messengerId !== "ALL" ? { currentMessengerId: messengerId } : {}),
    },
    select: {
      tc: true,
      status: true,
      provincia: true,
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

  const zip = new JSZip();
  for (const card of cards) {
    const diasVencidos = Math.abs(Math.min(0, remainingBusinessDays(new Date(), card.slaDueDate ?? today)));
    const svg = buildSlaSvg({
      nombre: card.customer.nombre,
      cedula: card.customer.cedula,
      tc: card.tc,
      provincia: card.provincia,
      status: card.status.replaceAll("_", " "),
      mensajero: displayText(card.currentMessenger?.nombre),
      slaDate: formatDate(card.slaDueDate),
      diasVencidos,
      direccion: displayText(card.customer.direccionRaw),
      telefonos: splitPhones(card.customer.telefonosRaw),
    });
    const jpg = await svgToJpeg(svg);
    const filename = `${sanitizeFilePart(card.customer.nombre)} - ${sanitizeFilePart(card.tc)}.jpg`;
    zip.file(filename, jpg);
  }

  const zipContent = await zip.generateAsync({ type: "arraybuffer" });
  const suffix = messengerId && messengerId !== "ALL" ? "mensajero" : "general";
  return new NextResponse(zipContent, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sla-vencidas-${suffix}.zip"`,
    },
  });
}
