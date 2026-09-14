import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import {
  buildOffFilterMatchWhere,
  compileOffFilterWhere,
  getOffFilterCountSecurity,
  ListQueryValidationError,
  OFF_FILTER_COUNT_MAX_IDS,
} from "@/lib/list-query/off-filter-count";

/**
 * SDD card-groups remediation — FIX 2.
 *
 * Answers "how many of these selected card ids do NOT match the active
 * `/tarjetas` filter", server-side. `tarjetas-client.tsx` computed this by
 * checking selected ids against the currently loaded PAGE, which falsely
 * reports every selection as off-filter as soon as the operator pages
 * without touching any filter. Only the database can answer this correctly.
 *
 * Kept as the `/tarjetas`-bound entry point its client already calls, but the
 * predicate and the id cap now come from `lib/list-query/off-filter-count` —
 * the same module `POST /api/list-query/off-filter-count` uses. There is
 * exactly ONE place that decides the predicate, so this route and the generic
 * one cannot drift apart.
 */
const RESOURCE = "tarjetas" as const;

const bodySchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(OFF_FILTER_COUNT_MAX_IDS),
  filters: z.record(z.string(), z.string()).default({}),
});

export async function POST(request: Request) {
  const auth = await requireApiSession([...getOffFilterCountSecurity(RESOURCE).allowedRoles]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  let where;
  try {
    where = compileOffFilterWhere(RESOURCE, new URLSearchParams(parsed.data.filters));
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const { cardIds } = parsed.data;
  const matching = await prisma.card.count({
    where: buildOffFilterMatchWhere(where, cardIds),
  });

  return NextResponse.json({ offFilterCount: cardIds.length - matching });
}
