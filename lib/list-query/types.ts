/**
 * Declarative list-query contract shared by every paginated list route.
 *
 * Pure and Prisma-free by design: a descriptor only DESCRIBES a query, and
 * `compile()` turns it into the plain `where` / `orderBy` / `skip` / `take`
 * objects Prisma accepts. That keeps the whole contract unit testable under the
 * node vitest environment with relative imports.
 */

export type SortDirection = "asc" | "desc";

/**
 * A dotted field path. A single segment is a root column (`"status"`); more than
 * one segment walks a relation (`"customer.cedula"`).
 */
export type FieldPath = string;

/**
 * A field path constrained to the resource's own `Prisma.XWhereInput`.
 *
 * The first segment MUST be a real column or relation on that model, so a typo
 * such as `"estatus"` on a model that spells it `status` fails at compile time
 * under TypeScript strict. Segments past a relation stay open, because Prisma's
 * nested where types are not reachable by a simple indexed access.
 */
export type WhereFieldPath<TWhere> =
  | (keyof TWhere & string)
  | `${keyof TWhere & string}.${string}`;

/**
 * Enum filter. The string `"ALL"` is the established "no constraint" sentinel
 * across this codebase — it is NOT `undefined` and must never be treated as one.
 * A value outside `values` is REJECTED by default. `onInvalid: "drop"` records a
 * route that has always ignored an unknown value instead of failing.
 */
export type EnumFilter<TWhere = unknown> = {
  readonly kind: "enum";
  readonly param: string;
  readonly field: WhereFieldPath<TWhere>;
  readonly values: readonly string[];
  readonly onInvalid?: "reject" | "drop";
  /**
   * Optional COERCION applied before the whitelist check, for a route whose
   * current behaviour is to map legacy/alias spellings onto a valid value
   * instead of rejecting them (`app/api/tarjetas` and `toCardStatus`).
   *
   * The `"ALL"` sentinel is honoured BEFORE coercion, so a coercer never has to
   * know about it. A coercer that returns a value outside `values` still falls
   * through to `onInvalid`, so it cannot smuggle an unwhitelisted value in.
   */
  readonly coerce?: (raw: string) => string;
};

/**
 * Boolean filter. `"binary"` (the default) accepts `"1"` / `"0"`; `"literal"`
 * accepts `"true"` / `"false"`, which is what `config/usuarios` has always
 * accepted. Anything else counts as absent.
 */
export type BooleanFilter<TWhere = unknown> = {
  readonly kind: "boolean";
  readonly param: string;
  readonly field: WhereFieldPath<TWhere>;
  readonly encoding?: "binary" | "literal";
  /**
   * When true only the truthy token applies a constraint and the falsy token is
   * IGNORED. Reproduces `searchParams.get("onlyActive") === "1"`, where `"0"`
   * never meant `activo: false`.
   */
  readonly truthyOnly?: boolean;
};

/**
 * Exact-match string filter for an open-ended catalog value such as `provincia`
 * or `zona`. Blank counts as absent, and so does the `"ALL"` sentinel unless
 * `sentinel: false` records a route that never honoured it.
 */
export type StringFilter<TWhere = unknown> = {
  readonly kind: "string";
  readonly param: string;
  readonly field: WhereFieldPath<TWhere>;
  /** Defaults to true. Set false where the route applies any non-empty value. */
  readonly sentinel?: boolean;
  /** Emits `{ equals, mode: "insensitive" }` instead of a bare scalar. */
  readonly insensitive?: boolean;
};

/**
 * Inclusive date range, always applied in the database.
 *
 * `"utcDay"` (the default) snaps to `T00:00:00.000Z` / `T23:59:59.999Z`.
 * `"localDay"` snaps to the SERVER's local midnight and end of day, which is
 * what `config/usuarios/[id]/actividad` has always done.
 * `"instant"` does NOT snap at all: both bounds are parsed with date-fns
 * `parseISO`, so a bare `YYYY-MM-DD` becomes LOCAL MIDNIGHT on BOTH edges and
 * `to` therefore EXCLUDES its own day. That is not a nicety, it is exactly what
 * `app/api/tarjetas` has always done, and widening it would change results.
 */
export type DateRangeFilter<TWhere = unknown> = {
  readonly kind: "dateRange";
  readonly field: WhereFieldPath<TWhere>;
  readonly fromParam: string;
  readonly toParam: string;
  readonly boundaries?: "utcDay" | "localDay" | "instant";
};

/**
 * A single `date` param expanded to the half-open range `[start, start + 1 day)`.
 *
 * This is NOT a convenience over `dateRange`: rutas, lotes and redacciones only
 * ever accepted one `date` param, and describing them as a from/to range would
 * silently widen their public API.
 */
export type SingleDayFilter<TWhere = unknown> = {
  readonly kind: "day";
  readonly param: string;
  readonly field: WhereFieldPath<TWhere>;
};

/**
 * Same acceptance rules as `EnumFilter`, but `param` carries a COMMA-SEPARATED
 * list of tokens and the compiled clause becomes `{ in: [...] }`. A single
 * token (no comma) behaves identically to `EnumFilter`, so upgrading a field
 * from `"enum"` to `"enumList"` is backward compatible with every existing
 * caller that only ever sent one value.
 */
export type EnumListFilter<TWhere = unknown> = {
  readonly kind: "enumList";
  readonly param: string;
  readonly field: WhereFieldPath<TWhere>;
  readonly values: readonly string[];
  readonly onInvalid?: "reject" | "drop";
  readonly coerce?: (raw: string) => string;
};

/**
 * Same acceptance rules as `StringFilter`, but `param` carries a COMMA-SEPARATED
 * list of tokens and the compiled clause becomes `{ in: [...] }`. A single
 * token is backward compatible with `StringFilter`.
 */
export type StringListFilter<TWhere = unknown> = {
  readonly kind: "stringList";
  readonly param: string;
  readonly field: WhereFieldPath<TWhere>;
  readonly sentinel?: boolean;
};

export type ListFilter<TWhere = unknown> =
  | EnumFilter<TWhere>
  | EnumListFilter<TWhere>
  | BooleanFilter<TWhere>
  | StringFilter<TWhere>
  | StringListFilter<TWhere>
  | DateRangeFilter<TWhere>
  | SingleDayFilter<TWhere>;

export type ListQuerySort<TWhere = unknown> = {
  /** Whitelist of accepted `sort` keys mapped to their field path. */
  readonly keys: Readonly<Record<string, WhereFieldPath<TWhere>>>;
  /**
   * The resource's CURRENT hardcoded ordering. Used when no sort key is given
   * and when a non-whitelisted key is requested, so a bad key degrades to
   * today's behaviour instead of losing ordering entirely.
   */
  readonly fallbackOrderBy: readonly Record<string, unknown>[];
};

export type ListQueryPagination = {
  readonly defaultPageSize: number;
  readonly maxPageSize: number;
};

export type ListQueryDescriptorInput<TWhere = unknown> = {
  readonly key: string;
  /** Whitelisted searchable field paths for `q`. Anything else is never queried. */
  readonly searchFields: readonly WhereFieldPath<TWhere>[];
  readonly filters: readonly ListFilter<TWhere>[];
  readonly sort: ListQuerySort<TWhere>;
  readonly pagination: ListQueryPagination;
  /** Param carrying the free-text search. Defaults to `"q"`. */
  readonly searchParam?: string;
  /** Param narrowing the search to a subset of `searchFields`. Defaults to `"qFields"`. */
  readonly searchFieldsParam?: string;
  /**
   * When true, omitting BOTH `page` and `pageSize` returns the full unpaginated
   * set. Only `/api/mensajeros` needs this, and many callers depend on it.
   */
  readonly allowUnpaginated?: boolean;
};

/**
 * A compiled descriptor. `TWhere` is the resource's `Prisma.XWhereInput`, so a
 * field typo in a descriptor fails at compile time under TypeScript strict.
 */
export type ListQueryDescriptor<TWhere> = {
  readonly key: string;
  readonly searchParam: string;
  readonly searchFieldsParam: string;
  readonly searchFields: readonly WhereFieldPath<TWhere>[];
  readonly filters: readonly ListFilter<TWhere>[];
  readonly sort: ListQuerySort<TWhere>;
  readonly pagination: ListQueryPagination;
  readonly allowUnpaginated: boolean;
};

/**
 * A descriptor with its field-path types erased.
 *
 * `WhereFieldPath<TWhere>` is not covariant, so descriptors for different models
 * cannot share one container. Runtime consumers that resolve a descriptor by key
 * (distinct-values, groupBy) work against this erased shape and re-attach the
 * concrete `TWhere` at their own call site.
 */
export type ErasedListQueryDescriptor = {
  readonly key: string;
  readonly searchParam: string;
  readonly searchFieldsParam: string;
  readonly searchFields: readonly FieldPath[];
  readonly filters: readonly ListFilter<Record<string, unknown>>[];
  readonly sort: {
    readonly keys: Readonly<Record<string, FieldPath>>;
    readonly fallbackOrderBy: readonly Record<string, unknown>[];
  };
  readonly pagination: ListQueryPagination;
  readonly allowUnpaginated: boolean;
};

export type CompiledListQuery<TWhere> = {
  readonly where: TWhere;
  /**
   * Mutable on purpose: Prisma's generated `orderBy` inputs are mutable arrays,
   * and `compile()` always returns a freshly built array, never the descriptor's
   * own frozen `fallbackOrderBy`.
   */
  readonly orderBy: Record<string, unknown>[];
  readonly page: number;
  readonly pageSize: number;
  /** Undefined when `unpaginated` is true. */
  readonly skip?: number;
  /** Undefined when `unpaginated` is true. */
  readonly take?: number;
  /** True only for an `allowUnpaginated` descriptor called without page params. */
  readonly unpaginated: boolean;
  /**
   * True when the parameters are self-contradictory (for example `from` after
   * `to`). The compiled `where` still yields an empty set, so a route may either
   * run the query or short-circuit.
   */
  readonly impossible: boolean;
};

/**
 * Composition options for `compile()`.
 *
 * With neither list present the compiled `where` stays FLAT, exactly as before.
 * With either present the `where` becomes `{ AND: [...] }` and every compiled
 * clause becomes a conjunct, so the free-text search's top-level `OR` can never
 * overwrite a mandatory clause that also uses `OR` — the failure mode that made
 * `app/api/operativo/contacto` unmigratable in Phase 10.
 */
export type CompileOptions<TWhere> = {
  /** Mandatory clauses emitted BEFORE the compiled ones (authorization scope). */
  readonly andPrefix?: readonly TWhere[];
  /** Mandatory clauses emitted AFTER the compiled ones. */
  readonly andSuffix?: readonly TWhere[];
};

/** Anything with URLSearchParams-compatible reads. */
export type ListQueryParams = {
  get(name: string): string | null;
  has(name: string): boolean;
};
