import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { getCardIdentifier, getCardIdentifierLabel } from "@/lib/card-identifier";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function svgToJpeg(svg: string) {
  return sharp(Buffer.from(svg))
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const cardId = request.nextUrl.searchParams.get("cardId");
  if (!cardId) {
    return NextResponse.json({ error: "cardId es requerido" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { customer: true },
  });
  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }

  const root = asRecord(card.metadata);
  const operativo = asRecord(root.operativo);
  const phones = Array.isArray(operativo.telefonos)
    ? operativo.telefonos
        .map((item) => {
          const row = asRecord(item);
          return typeof row.num === "string" ? row.num : null;
        })
        .filter((item): item is string => Boolean(item))
    : (card.customer.telefonosRaw?.match(/\d{7,}/g) ?? []);

  const comentario = typeof operativo.comentarioContacto === "string" ? operativo.comentarioContacto : "";
  const contactado = Boolean(operativo.contactado);

  const phoneLines = phones.length ? phones.join(" - ") : "-";
  const generatedAt = new Date().toLocaleString("es-DO");

  const customerName = escapeXml(card.customer.nombre);
  const identifier = getCardIdentifier(card);
  const identifierLabel = getCardIdentifierLabel(card);
  const tc = escapeXml(identifier);
  const cedula = escapeXml(card.customer.cedula);
  const provincia = escapeXml(card.provincia);
  const zona = escapeXml(card.zona);
  const phonesSafe = escapeXml(phoneLines);
  const addressSafe = escapeXml(card.customer.direccionRaw ?? "-").slice(0, 110);
  const commentSafe = escapeXml(comentario || "-").slice(0, 400);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f2544"/>
      <stop offset="100%" stop-color="#173661"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1200" height="700" fill="url(#bg)"/>
  <rect x="40" y="40" width="1120" height="620" rx="24" fill="#ffffff"/>
  <text x="80" y="110" font-size="28" font-family="Arial" fill="#1e293b" font-weight="700">Resumen para mensajero</text>
  <text x="80" y="145" font-size="20" font-family="Arial" fill="#0f2544" font-weight="700">${customerName}</text>
  <text x="80" y="175" font-size="16" font-family="Arial" fill="#64748b">${identifierLabel} ${tc} - Cedula ${cedula}</text>
  <text x="80" y="210" font-size="16" font-family="Arial" fill="#64748b">Provincia ${provincia} - Zona ${zona}</text>
  <text x="80" y="245" font-size="15" font-family="Arial" fill="#334155">Telefonos: ${phonesSafe}</text>
  <text x="80" y="280" font-size="15" font-family="Arial" fill="#334155">Direccion: ${addressSafe}</text>
  <text x="80" y="315" font-size="15" font-family="Arial" fill="#334155">Estado operativo: ${contactado ? "CONTACTADO" : "PENDIENTE CONTACTO"}</text>
  <rect x="80" y="345" width="1040" height="250" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="100" y="380" font-size="15" font-family="Arial" fill="#334155" font-weight="700">Comentario</text>
  <text x="100" y="415" font-size="15" font-family="Arial" fill="#475569">${commentSafe}</text>
  <text x="80" y="640" font-size="13" font-family="Arial" fill="#64748b">Generado ${escapeXml(generatedAt)}</text>
</svg>`;

  const jpg = await svgToJpeg(svg);
  return new NextResponse(Uint8Array.from(jpg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="contacto-${identifier}.jpg"`,
    },
  });
}
