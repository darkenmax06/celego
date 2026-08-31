import { parseISO } from "date-fns";
import type {
  CompiledListQuery,
  CompileOptions,
  FieldPath,
  ListQueryDescriptor,
  ListQueryDescriptorInput,
  ListQueryParams,
  SortDirection,
} from "./types";

/** The established "no constraint" sentinel for enum filters across this codebase. */
export const ALL_SENTINEL = "ALL";

export class ListQueryValidationError extends Error {
  readonly code: "INVALID_ENUM_VALUE";
  readonly param: string;

  constructor(code: "INVALID_ENUM_VALUE", param: string, message: string) {
    super(message);
    this.name = "ListQueryValidationError";
    this.code = code;
    this.param = param;
  }
}

/**
 * Declares a list query for one resource.
 *
 * `TWhere` should be that resource's `Prisma.XWhereInput`, so `compile()` hands
 * routes a correctly typed `where` instead of `Record<string, unknown>`.
 */
export function defineListQuery<TWhere>(
  input: ListQueryDescriptorInput<TWhere>,
): ListQueryDescriptor<TWhere> {
  return {
    key: input.key,
    searchParam: input.searchParam ?? "q",
    searchFieldsParam: input.searchFieldsParam ?? "qFields",
    searchFields: input.searchFields,
    filters: input.filters,
    sort: input.sort,
    pagination: input.pagination,
    allowUnpaginated: input.allowUnpaginated ?? false,
  };
}

/** Builds `{ a: { b: value } }` from the dotted path `"a.b"`. */
function nest(path: FieldPath, value: unknown): Record<string, unknown> {
  const segments = path.split(".");
  let built = value;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    built = { [segments[i]]: built };
  }
  return built as Record<string, unknown>;
}

/**
 * Parses `YYYY-MM-DD` (or any ISO date) as a day boundary.
 *
 * `"utcDay"` snaps to `T00:00:00.000Z` / `T23:59:59.999Z`; `"localDay"` omits the
 * zone so the runtime resolves it in the server's local time, which is exactly
 * what the actividad route has always done.
 */
function parseDayBoundary(
  raw: string,
  edge: "start" | "end",
  boundaries: "utcDay" | "localDay" | "instant",
): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (boundaries === "instant") {
    // No snapping: `parseISO` verbatim on BOTH edges, so `to` lands on local
    // midnight and excludes its own day. Reproduces `app/api/tarjetas`.
    const instant = parseISO(trimmed);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const suffix =
    boundaries === "localDay"
      ? edge === "start"
        ? "T00:00:00"
        : "T23:59:59.999"
      : edge === "start"
        ? "T00:00:00.000Z"
        : "T23:59:59.999Z";
  const parsed = new Date(dayOnly ? `${trimmed}${suffix}` : trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Expands a single `date` param into `[start, start + 1 day)`, reproducing the
 * `new Date(date)` + `setDate(getDate() + 1)` idiom shared by rutas, lotes and
 * redacciones. The `+1 day` step is deliberately local-calendar, like the routes.
 */
function expandSingleDay(raw: string): { gte: Date; lt: Date } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const start = new Date(trimmed);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Compiles request parameters into Prisma `where` / `orderBy` / `skip` / `take`.
 *
 * Throws `ListQueryValidationError` only for an enum value outside its
 * whitelist; every other malformed input degrades to "no constraint" rather than
 * failing the request.
 */
export function compile<TWhere>(
  descriptor: ListQueryDescriptor<TWhere>,
  params: ListQueryParams,
  options: CompileOptions<TWhere> = {},
): CompiledListQuery<TWhere> {
  // Kept separate so both shapes stay exact: the FLAT where assigns the search
  // `OR` first (its historical key order), while the AND shape emits the filter
  // conjuncts first and the search last, matching the hand-written `AND: [...]`
  // of `app/api/operativo/contacto`.
  let searchClause: Record<string, unknown> | null = null;
  const filterClauses: Record<string, unknown>[] = [];
  const addClause = (clause: Record<string, unknown>) => filterClauses.push(clause);
  let impossible = false;

  // --- free-text search over the whitelisted paths only -------------------
  const q = params.get(descriptor.searchParam)?.trim();
  if (q) {
    const requested = params
      .get(descriptor.searchFieldsParam)
      ?.split(",")
      .map((field) => field.trim())
      .filter(Boolean);

    // Anything not on the whitelist is dropped here and is therefore never
    // queried. If nothing survives, the full whitelist is used.
    const whitelist = descriptor.searchFields as readonly string[];
    const allowed = requested?.filter((field) => whitelist.includes(field));
    const fields = allowed && allowed.length > 0 ? allowed : descriptor.searchFields;

    searchClause = {
      OR: fields.map((field) => nest(field, { contains: q, mode: "insensitive" })),
    };
  }

  // --- typed filters ------------------------------------------------------
  for (const filter of descriptor.filters) {
    if (filter.kind === "dateRange") {
      const boundaries = filter.boundaries ?? "utcDay";
      const from = params.get(filter.fromParam);
      const to = params.get(filter.toParam);
      const gte = from ? parseDayBoundary(from, "start", boundaries) : null;
      const lte = to ? parseDayBoundary(to, "end", boundaries) : null;
      if (!gte && !lte) continue;
      if (gte && lte && gte.getTime() > lte.getTime()) impossible = true;
      addClause(nest(filter.field, { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }));
      continue;
    }

    const raw = params.get(filter.param);
    if (raw === null) continue;
    const value = raw.trim();
    if (!value) continue;

    if (filter.kind === "day") {
      const range = expandSingleDay(value);
      if (!range) continue;
      addClause(nest(filter.field, range));
      continue;
    }

    if (filter.kind === "enum") {
      if (value === ALL_SENTINEL) continue;
      // Coercion runs AFTER the sentinel and BEFORE the whitelist, so a legacy
      // spelling is accepted while an uncoercible value still hits `onInvalid`.
      const coerced = filter.coerce ? filter.coerce(value) : value;
      if (!filter.values.includes(coerced)) {
        if (filter.onInvalid === "drop") continue;
        throw new ListQueryValidationError(
          "INVALID_ENUM_VALUE",
          filter.param,
          `Valor no permitido para ${filter.param}: ${value}`,
        );
      }
      addClause(nest(filter.field, coerced));
      continue;
    }

    if (filter.kind === "enumList") {
      if (value === ALL_SENTINEL) continue;
      const tokens = value
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean);
      const resolved: string[] = [];
      for (const token of tokens) {
        const coerced = filter.coerce ? filter.coerce(token) : token;
        if (!filter.values.includes(coerced)) {
          if (filter.onInvalid === "drop") continue;
          throw new ListQueryValidationError(
            "INVALID_ENUM_VALUE",
            filter.param,
            `Valor no permitido para ${filter.param}: ${token}`,
          );
        }
        if (!resolved.includes(coerced)) resolved.push(coerced);
      }
      if (!resolved.length) continue;
      // A single token compiles to the SAME bare-value shape `"enum"` produces,
      // so upgrading a field from `"enum"` to `"enumList"` never changes the
      // `where` Prisma sees for any caller that only ever sent one value.
      addClause(nest(filter.field, resolved.length === 1 ? resolved[0] : { in: resolved }));
      continue;
    }

    if (filter.kind === "stringList") {
      if ((filter.sentinel ?? true) && value === ALL_SENTINEL) continue;
      const tokens = Array.from(
        new Set(
          value
            .split(",")
            .map((token) => token.trim())
            .filter(Boolean),
        ),
      );
      if (!tokens.length) continue;
      addClause(nest(filter.field, tokens.length === 1 ? tokens[0] : { in: tokens }));
      continue;
    }

    if (filter.kind === "boolean") {
      const [truthy, falsy] =
        (filter.encoding ?? "binary") === "literal" ? ["true", "false"] : ["1", "0"];
      if (value === truthy) {
        addClause(nest(filter.field, true));
        continue;
      }
      // A truthy-only filter never meant `false`; the falsy token is absent.
      if (value === falsy && !filter.truthyOnly) {
        addClause(nest(filter.field, false));
      }
      continue;
    }

    // string — `"ALL"` is the sentinel everywhere in this codebase, including
    // for open-ended catalog values such as `provincia` and `zona`, unless the
    // route it mirrors never honoured it.
    if ((filter.sentinel ?? true) && value === ALL_SENTINEL) continue;
    addClause(
      nest(filter.field, filter.insensitive ? { equals: value, mode: "insensitive" } : value),
    );
  }

  const andPrefix = options.andPrefix ?? [];
  const andSuffix = options.andSuffix ?? [];
  const compose = andPrefix.length > 0 || andSuffix.length > 0;

  let where: Record<string, unknown>;
  if (compose) {
    where = {
      AND: [
        ...andPrefix,
        ...filterClauses,
        ...(searchClause ? [searchClause] : []),
        ...andSuffix,
      ],
    };
  } else {
    where = {};
    if (searchClause) Object.assign(where, searchClause);
    for (const clause of filterClauses) Object.assign(where, clause);
  }

  // --- ordering -----------------------------------------------------------
  const sortKey = params.get("sort")?.trim();
  const fieldPath = sortKey ? descriptor.sort.keys[sortKey] : undefined;
  const orderRaw = params.get("order")?.trim();
  const direction: SortDirection = orderRaw === "asc" ? "asc" : "desc";
  const orderBy = fieldPath
    ? [nest(fieldPath, direction)]
    : [...descriptor.sort.fallbackOrderBy];

  // --- pagination ---------------------------------------------------------
  const pageParam = params.get("page");
  const pageSizeParam = params.get("pageSize");
  const unpaginated = descriptor.allowUnpaginated && pageParam === null && pageSizeParam === null;

  const page = clampInt(pageParam, 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInt(
    pageSizeParam,
    descriptor.pagination.defaultPageSize,
    1,
    descriptor.pagination.maxPageSize,
  );

  return {
    where: where as TWhere,
    orderBy,
    page,
    pageSize,
    skip: unpaginated ? undefined : (page - 1) * pageSize,
    take: unpaginated ? undefined : pageSize,
    unpaginated,
    impossible,
  };
}

export type ListEnvelopePagination = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
};

/**
 * Builds the `pagination` object every migrated route emits.
 * Key order is frozen (`page`, `pageSize`, `total`, `totalPages`) because the
 * golden envelopes assert it.
 */
export function buildListEnvelope(input: {
  page: number;
  pageSize: number;
  total: number;
}): ListEnvelopePagination {
  return {
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    totalPages: Math.max(1, Math.ceil(input.total / input.pageSize)),
  };
}
