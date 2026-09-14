import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { CARD_GROUP_PARAM, compileCardGroupWhere } from "@/lib/list-query/card-group-where";
import { prisma } from "@/lib/prisma";

/**
 * SDD card-groups — Stage D.
 *
 * Feeds "load a whole group into the scan table" on `/modificacion-masiva`.
 *
 * WHY A PURPOSE-BUILT ROUTE instead of `GET /api/tarjetas?grupo=<id>`:
 *  - `/api/tarjetas` is capped at `maxPageSize: 200`, so one group load would
 *    need client-side page chasing for a set the screen wants atomically.
 *  - It answers with the full list row (product type, messenger, urgent case,
 *    group ids, ...). The scan table renders seven fields; shipping the rest
 *    for up to 500 rows is pure waste.
 *  - It is readable by ADMIN/OPERADOR/FACTURACION/MENSAJERO. This screen and
 *    `POST /api/tarjetas/lote/estado` are both ADMIN/OPERADOR, and a loader
 *    that exists only to stage a bulk mutation is gated with the stricter one.
 *
 * The membership predicate is NOT re-derived here: it comes from
 * `compileCardGroupWhere`, the single declaration shared with `/tarjetas`,
 * `/sla-vencidas` and `/operativo`.
 */

/**
 * Maximum cards one load brings into the scan table.
 *
 * The table renders nine cells per row, including a controlled checkbox whose
 * `checked` is computed with `selectedCardIds.includes(card.id)` — an O(n^2)
 * pass over the whole table on every render, and it re-renders on every single
 * toggle. 500 rows is 250k comparisons per render, which is comfortable; an
 * order of magnitude more is not. 500 also matches the cap already enforced on
 * `cardIds` by the `/api/card-groups` write routes, so a fully loaded table
 * still produces a batch payload those routes accept.
 */
export const CARD_GROUP_LOAD_CAP = 500;

const CARD_SELECT = {
  id: true,
  tc: true,
  provincia: true,
  zona: true,
  isRemote: true,
  status: true,
  customer: { select: { nombre: true, cedula: true } },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const group = await prisma.cardGroup.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!group) {
    return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
  }

  const where = compileCardGroupWhere(new URLSearchParams({ [CARD_GROUP_PARAM]: id }));
  if (!where) {
    // Unreachable for a real group id; the shared compiler only declines the
    // "no constraint" tokens. Fail closed rather than selecting every card.
    return NextResponse.json({ error: "Grupo invalido" }, { status: 400 });
  }

  const total = await prisma.card.count({ where });
  const cards = await prisma.card.findMany({
    where,
    select: CARD_SELECT,
    orderBy: { createdAt: "desc" },
    take: CARD_GROUP_LOAD_CAP,
  });

  return NextResponse.json({
    group,
    cards: cards.map((card) => ({
      id: card.id,
      tc: card.tc,
      provincia: card.provincia ?? "",
      zona: card.zona ?? "",
      isRemote: Boolean(card.isRemote),
      status: card.status,
      customer: {
        nombre: card.customer?.nombre ?? "",
        cedula: card.customer?.cedula ?? "",
      },
    })),
    total,
    cap: CARD_GROUP_LOAD_CAP,
    truncated: total > cards.length,
  });
}
