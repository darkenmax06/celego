/**
 * SDD card-groups — single source of truth for the `relationSome` predicate.
 *
 * `compile()` uses this for every descriptor that declares a `relationSome`
 * filter (`/tarjetas`, `/sla-vencidas`), and `card-group-where.ts` uses the
 * exact same function for `app/api/operativo/contacto`, whose `where` is built
 * by hand across three tab branches and therefore cannot go through the
 * compiler. Keeping the token parsing, the `noneToken` handling and the
 * multi-value OR shape in ONE function is what stops the two paths from
 * silently disagreeing about what "Grupo" means.
 */
export type RelationSomeSpec = {
  /** SINGLE-segment to-many relation key. */
  readonly relation: string;
  /** Scalar column inside the related model matched against the token list. */
  readonly relationField: string;
  /** Token meaning "no related rows at all" -> `{ none: {} }`. */
  readonly noneToken?: string;
};

export type RelationSomeClause = {
  readonly clause: Record<string, unknown>;
  /**
   * `true` when the clause is a top-level `OR`, so a caller composing several
   * clauses must use the `AND: [...]` shape rather than merging keys.
   */
  readonly usesCombinator: boolean;
};

/**
 * Turns a raw comma-separated parameter value into a relation clause.
 * Returns `null` when the value carries no usable token, meaning "no
 * constraint". The caller is responsible for the `ALL` sentinel check.
 */
export function buildRelationSomeClause(
  spec: RelationSomeSpec,
  value: string,
): RelationSomeClause | null {
  const tokens = Array.from(
    new Set(
      value
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
  if (!tokens.length) return null;

  const wantsNone = spec.noneToken ? tokens.includes(spec.noneToken) : false;
  const ids = spec.noneToken ? tokens.filter((token) => token !== spec.noneToken) : tokens;
  const noneClause = { [spec.relation]: { none: {} } };

  if (!ids.length) {
    return wantsNone ? { clause: noneClause, usesCombinator: false } : null;
  }

  const someClause = {
    [spec.relation]: {
      some: { [spec.relationField]: ids.length === 1 ? ids[0] : { in: ids } },
    },
  };

  if (!wantsNone) return { clause: someClause, usesCombinator: false };
  return { clause: { OR: [someClause, noneClause] }, usesCombinator: true };
}
