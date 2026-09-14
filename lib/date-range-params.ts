/**
 * Shared encoding of the per-field date range filters used by card list views.
 *
 * Pure and dependency-free so the list-query compiler (server), the route
 * handlers and the client views all agree on one param scheme:
 *
 *   date.<field>.from = yyyy-MM-dd
 *   date.<field>.to   = yyyy-MM-dd   (inclusive of the whole day)
 *
 * Several fields may be active at once; they are combined with AND.
 *
 * The earlier single-field form `dateField` + `dateFrom` + `dateTo` is still
 * accepted everywhere (saved favorites and shared links) and is mapped onto the
 * per-field form by `normalizeDateRangeFilters` / the compiler.
 */

export const DATE_RANGE_PARAM_PREFIX = "date";

export const LEGACY_DATE_FIELD_PARAM = "dateField";
export const LEGACY_DATE_FROM_PARAM = "dateFrom";
export const LEGACY_DATE_TO_PARAM = "dateTo";
/** Field the legacy form targeted when `dateField` was omitted. */
export const LEGACY_DEFAULT_DATE_FIELD = "dispatchDate";

export type DateRangeEdge = "from" | "to";

export type DateRangeValue = {
  /** `yyyy-MM-dd` */
  from?: string;
  /** `yyyy-MM-dd`, inclusive of the selected day. */
  to?: string;
};

export type DateRangeMap = Record<string, DateRangeValue>;

export type DateRangeFieldOption = { value: string; label: string };

type FilterRecord = Record<string, string | undefined>;

export function dateRangeParamKey(field: string, edge: DateRangeEdge): string {
  return `${DATE_RANGE_PARAM_PREFIX}.${field}.${edge}`;
}

/** Parses `date.<field>.<from|to>`; anything else returns `null`. */
export function parseDateRangeParamKey(key: string): { field: string; edge: DateRangeEdge } | null {
  const prefix = `${DATE_RANGE_PARAM_PREFIX}.`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const edge = rest.slice(dot + 1);
  if (edge !== "from" && edge !== "to") return null;
  return { field: rest.slice(0, dot), edge };
}

/** Every filter key a view must persist (for example in the URL) for these fields. */
export function dateRangeParamKeys(fields: readonly string[]): string[] {
  return fields.flatMap((field) => [dateRangeParamKey(field, "from"), dateRangeParamKey(field, "to")]);
}

function hasLegacyDateRange(filters: FilterRecord) {
  return Boolean(filters[LEGACY_DATE_FROM_PARAM] || filters[LEGACY_DATE_TO_PARAM]);
}

/**
 * Rewrites the legacy `dateField`/`dateFrom`/`dateTo` keys into the per-field
 * form. An explicit per-field bound wins over the legacy one. Returns the same
 * object when there is nothing to migrate.
 */
export function normalizeDateRangeFilters<T extends FilterRecord>(filters: T): T {
  const hasLegacyKeys =
    LEGACY_DATE_FIELD_PARAM in filters || LEGACY_DATE_FROM_PARAM in filters || LEGACY_DATE_TO_PARAM in filters;
  if (!hasLegacyKeys) return filters;

  const next: FilterRecord = { ...filters };
  const field = filters[LEGACY_DATE_FIELD_PARAM]?.trim() || LEGACY_DEFAULT_DATE_FIELD;
  const from = filters[LEGACY_DATE_FROM_PARAM];
  const to = filters[LEGACY_DATE_TO_PARAM];
  delete next[LEGACY_DATE_FIELD_PARAM];
  delete next[LEGACY_DATE_FROM_PARAM];
  delete next[LEGACY_DATE_TO_PARAM];
  if (hasLegacyDateRange(filters)) {
    const fromKey = dateRangeParamKey(field, "from");
    const toKey = dateRangeParamKey(field, "to");
    if (from && !next[fromKey]) next[fromKey] = from;
    if (to && !next[toKey]) next[toKey] = to;
  }
  return next as T;
}

/** Reads every active per-field range (legacy keys included) out of a filter record. */
export function readDateRanges(filters: FilterRecord): DateRangeMap {
  const ranges: DateRangeMap = {};
  for (const [key, value] of Object.entries(normalizeDateRangeFilters(filters))) {
    if (!value) continue;
    const parsed = parseDateRangeParamKey(key);
    if (!parsed) continue;
    ranges[parsed.field] = { ...ranges[parsed.field], [parsed.edge]: value };
  }
  return ranges;
}

/**
 * Returns a copy of `filters` with the range of `field` replaced; `undefined`
 * (or a range without bounds) clears only that field.
 */
export function withDateRange(
  filters: Record<string, string>,
  field: string,
  range: DateRangeValue | undefined,
): Record<string, string> {
  const next = normalizeDateRangeFilters({ ...filters });
  const fromKey = dateRangeParamKey(field, "from");
  const toKey = dateRangeParamKey(field, "to");
  delete next[fromKey];
  delete next[toKey];
  if (range?.from) next[fromKey] = range.from;
  if (range?.to) next[toKey] = range.to;
  return next;
}

/** Serializes a range map back into flat params (used by export payloads). */
export function dateRangesToParams(ranges: DateRangeMap): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [field, range] of Object.entries(ranges)) {
    if (range.from) params[dateRangeParamKey(field, "from")] = range.from;
    if (range.to) params[dateRangeParamKey(field, "to")] = range.to;
  }
  return params;
}

/** `yyyy-MM-dd` -> `dd/MM/yyyy`; anything else is returned untouched. */
export function formatDayParam(value?: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function dateRangeSummary(range: DateRangeValue): string {
  if (range.from && range.to) return `${formatDayParam(range.from)} - ${formatDayParam(range.to)}`;
  if (range.from) return `desde ${formatDayParam(range.from)}`;
  if (range.to) return `hasta ${formatDayParam(range.to)}`;
  return "";
}

/**
 * FilterBar `chipLabel` for date range keys: one chip per field, carried by
 * its `from` key (or its `to` key when there is no lower bound). Returns
 * `undefined` for keys that are not date range keys.
 */
export function dateRangeChipLabel(
  filters: FilterRecord,
  key: string,
  fields: readonly DateRangeFieldOption[],
): string | null | undefined {
  const parsed = parseDateRangeParamKey(key);
  if (!parsed) return undefined;
  if (parsed.edge === "to" && filters[dateRangeParamKey(parsed.field, "from")]) return null;
  const range: DateRangeValue = {
    from: filters[dateRangeParamKey(parsed.field, "from")],
    to: filters[dateRangeParamKey(parsed.field, "to")],
  };
  const label = fields.find((item) => item.value === parsed.field)?.label ?? parsed.field;
  return `${label}: ${formatDayParam(range.from) || "..."} - ${formatDayParam(range.to) || "..."}`;
}

/** FilterBar `chipRemovalKeys`: removing a date chip clears both bounds of its field. */
export function dateRangeChipRemovalKeys(key: string): string[] | undefined {
  const parsed = parseDateRangeParamKey(key);
  if (!parsed) return undefined;
  return [dateRangeParamKey(parsed.field, "from"), dateRangeParamKey(parsed.field, "to")];
}

/**
 * Inclusive in-memory match for views that filter already loaded rows.
 * `value` is any ISO date/datetime; the day is taken in local time, matching
 * the server's `localDay` boundaries.
 */
export function matchesDateRange(value: string | Date | null | undefined, range: DateRangeValue): boolean {
  if (!range.from && !range.to) return true;
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return false;
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}
