import type { Prisma } from "@prisma/client";
import { compile, ListQueryValidationError } from "@/lib/list-query";
import { getListQueryDescriptor } from "@/lib/list-query/registry";
import { RESOURCE_SECURITY, type ResourceSecurityConfig } from "@/lib/list-query/security";
import { applyContactoEstado } from "@/lib/list-query/tarjetas-where";

/**
 * The one place that decides the "is this card in filter" predicate for the
 * off-filter-count question, for every resource that can answer it.
 *
 * `POST /api/list-query/off-filter-count` and the older resource-bound
 * `POST /api/tarjetas/off-filter-count` both call `compileOffFilterWhere`, so
 * a second implementation cannot drift away from the first — that exact defect
 * has already been fixed twice on this surface.
 *
 * Two constraints are easy to drop and both silently UNDER-report the
 * off-filter count (they make the predicate wider, so more selected ids look
 * "in filter" than really are):
 *
 *  - `RESOURCE_SECURITY[resource].baseWhere()`. `/sla-vencidas` is defined
 *    almost entirely by it; the compiled descriptor `where` alone is not the
 *    full predicate.
 *  - `contactoEstado`. It reads a JSON `metadata` path, so it is not a
 *    `list-query` filter kind and `compile()` knows nothing about it. Both
 *    `/tarjetas` and `/sla-vencidas` compose it onto their list `where`, so
 *    both compose it here too, through the shared `applyContactoEstado`.
 */

/** Server-side cap on the selection an off-filter count may be asked about. */
export const OFF_FILTER_COUNT_MAX_IDS = 500;

/**
 * Resources that can answer the off-filter-count question.
 *
 * `/operativo` is deliberately absent: `app/api/operativo/contacto/route.ts`
 * hand-builds its `where` across three tab branches and then filters and
 * slices rows in memory, so an honest count is not a single
 * `prisma.card.count` and cannot be derived from a compiled predicate.
 */
export const OFF_FILTER_COUNT_RESOURCES = ["tarjetas", "sla-vencidas"] as const;

export type OffFilterCountResource = (typeof OFF_FILTER_COUNT_RESOURCES)[number];

export function isOffFilterCountResource(value: string): value is OffFilterCountResource {
  return (OFF_FILTER_COUNT_RESOURCES as readonly string[]).includes(value);
}

export function getOffFilterCountSecurity(
  resource: OffFilterCountResource,
): ResourceSecurityConfig {
  return RESOURCE_SECURITY[resource];
}

/**
 * Compiles the full "in filter" predicate for `resource`.
 *
 * Throws `ListQueryValidationError` for a malformed filter set and a plain
 * `Error` for a resource with no registered descriptor.
 */
export function compileOffFilterWhere(
  resource: string,
  params: URLSearchParams,
): Prisma.CardWhereInput {
  const security = RESOURCE_SECURITY[resource];
  if (!security) throw new Error(`Unknown off-filter-count resource: ${resource}`);

  const descriptor = getListQueryDescriptor(resource);
  const baseConstraint = security.baseWhere?.();
  const compiled = compile(
    descriptor,
    params,
    baseConstraint ? { andPrefix: [baseConstraint] } : {},
  );

  return applyContactoEstado(compiled.where as Prisma.CardWhereInput, params);
}

/** The `where` that counts only the selected ids still matching the filter. */
export function buildOffFilterMatchWhere(
  filterWhere: Prisma.CardWhereInput,
  cardIds: readonly string[],
): Prisma.CardWhereInput {
  return { AND: [filterWhere, { id: { in: [...cardIds] } }] };
}

export { ListQueryValidationError };
