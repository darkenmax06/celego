import type { Prisma } from "@prisma/client";
import { ALL_SENTINEL } from "./compile";
import { buildRelationSomeClause } from "./relation-some";
import type { RelationSomeFilter } from "./types";

/**
 * SDD card-groups — the "Grupo" filter, declared exactly once.
 *
 * `/tarjetas` and `/sla-vencidas` spread `CARD_GROUP_FILTER` into their
 * descriptors, so `compile()` builds the clause for them. `/operativo` builds
 * its `where` by hand in three separate tab branches and cannot use the
 * compiler at all, so it calls `compileCardGroupWhere` instead. Both routes go
 * through the same declaration and the same `buildRelationSomeClause`, which
 * is the only reason the three screens cannot end up disagreeing about what
 * "Grupo" or "Sin grupo" selects.
 */
export const CARD_GROUP_PARAM = "grupo";

/** UI token for "cards that belong to no group at all". */
export const CARD_GROUP_NONE_TOKEN = "SIN_GRUPO";

export const CARD_GROUP_FILTER: RelationSomeFilter<Prisma.CardWhereInput> = {
  kind: "relationSome",
  param: CARD_GROUP_PARAM,
  relation: "groupMemberships",
  relationField: "groupId",
  noneToken: CARD_GROUP_NONE_TOKEN,
};

/**
 * Translates the `grupo` search param into a `Card` constraint, or `undefined`
 * when the param carries no constraint (absent, empty or the `ALL` sentinel).
 */
export function compileCardGroupWhere(
  params: URLSearchParams,
): Prisma.CardWhereInput | undefined {
  const raw = params.get(CARD_GROUP_FILTER.param);
  if (raw === null) return undefined;
  const value = raw.trim();
  if (!value || value === ALL_SENTINEL) return undefined;

  const built = buildRelationSomeClause(CARD_GROUP_FILTER, value);
  return built ? (built.clause as Prisma.CardWhereInput) : undefined;
}
