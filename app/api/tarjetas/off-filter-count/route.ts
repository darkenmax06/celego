import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { compileTarjetasWhere, ListQueryValidationError } from "@/lib/list-query/tarjetas-where";

/**
 * SDD card-groups remediation — FIX 2.
 *
 * Answers "how many of these selected card ids do NOT match the active
 * `/tarjetas` filter", server-side. `tarjetas-client.tsx` computed this by
 * checking selected ids against the currently loaded PAGE, which falsely
 * reports every selection as off-filter as soon as the operator pages
 * without touching any filter. Only the database can answer this correctly.
 *
 * Reuses `compileTarjetasWhere` — the same `lib/list-query` compiled `where`
 * `GET /api/tarjetas` uses — so filter semantics cannot drift from the list.
 * Roles match `GET /api/tarjetas` (every role that can read the list may ask
 * this question). Caps `cardIds` at 500, mirroring the bulk endpoints.
 */
const bodySchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(500),
  filters: z.record(z.string(), z.string()).default({}),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const params = new URLSearchParams(parsed.data.filters);

  let where;
  try {
    ({ where } = compileTarjetasWhere(params));
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const { cardIds } = parsed.data;
  const matching = await prisma.card.count({
    where: { AND: [where, { id: { in: cardIds } }] },
  });

  return NextResponse.json({ offFilterCount: cardIds.length - matching });
}
