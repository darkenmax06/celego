import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import {
  buildOffFilterMatchWhere,
  compileOffFilterWhere,
  getOffFilterCountSecurity,
  isOffFilterCountResource,
  ListQueryValidationError,
  OFF_FILTER_COUNT_MAX_IDS,
} from "@/lib/list-query/off-filter-count";

/**
 * Resource-generic "how many of these selected card ids do NOT match the
 * active filter" endpoint.
 *
 * Shaped after `app/api/list-query/group-by/route.ts`: the resource comes from
 * the request, is resolved through `RESOURCE_SECURITY` for role gating and
 * through `LIST_QUERY_REGISTRY` for its descriptor. The predicate itself is
 * never decided here — `compileOffFilterWhere` is the single source of truth,
 * shared with the older `POST /api/tarjetas/off-filter-count`.
 */
const bodySchema = z.object({
  resource: z.string().min(1),
  cardIds: z.array(z.string().min(1)).min(1).max(OFF_FILTER_COUNT_MAX_IDS),
  filters: z.record(z.string(), z.string()).default({}),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const { resource, cardIds, filters } = parsed.data;

  if (!isOffFilterCountResource(resource)) {
    return NextResponse.json(
      { error: `Recurso no permitido o desconocido: ${resource}` },
      { status: 404 },
    );
  }

  const security = getOffFilterCountSecurity(resource);
  const auth = await requireApiSession([...security.allowedRoles]);
  if ("error" in auth) return auth.error;

  let where;
  try {
    where = compileOffFilterWhere(resource, new URLSearchParams(filters));
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const matching = await prisma.card.count({
    where: buildOffFilterMatchWhere(where, cardIds),
  });

  return NextResponse.json({ resource, offFilterCount: cardIds.length - matching });
}
