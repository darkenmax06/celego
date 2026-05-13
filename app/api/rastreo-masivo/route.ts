import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import {
  matchesTrackingToken,
  parseTrackingQueryItems,
  searchTrackingCards,
} from "@/lib/mass-tracking";

const requestSchema = z.object({
  query: z.string().min(1).max(50000),
  limit: z.number().int().min(1).max(5000).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const tokens = parseTrackingQueryItems(parsed.data.query);
  if (!tokens.length) {
    return NextResponse.json({ error: "Debes incluir al menos un nombre, cedula o tarjeta" }, { status: 400 });
  }

  const limit = parsed.data.limit ?? 1200;
  const cards = await searchTrackingCards(tokens);

  const rows = cards
    .map((card) => {
      const matchedBy = tokens.filter((token) => matchesTrackingToken(card, token)).slice(0, 8);
      return {
        id: card.id,
        tc: card.tc,
        externalReference: card.externalReference,
        nombre: card.customer.nombre,
        cedula: card.customer.cedula,
        status: card.status,
        provincia: card.provincia,
        zona: card.zona,
        mensajero: card.currentMessenger?.nombre ?? "",
        fechaDespacho: card.dispatchDate?.toISOString() ?? null,
        slaVence: card.slaDueDate?.toISOString() ?? null,
        urgente: card.urgent,
        remota: card.isRemote,
        tipoEntrega: card.deliveryType ?? "",
        tipoEmision: card.emissionType ?? "",
        telefonos: card.customer.telefonosRaw ?? "",
        direccion: card.customer.direccionRaw ?? "",
        motivoRetorno: card.returnReason ?? "",
        matchedBy,
        matchScore: matchedBy.length,
        updatedAt: card.updatedAt.toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .slice(0, limit);

  return NextResponse.json({
    totalTokens: tokens.length,
    matches: rows.length,
    rows,
  });
}
