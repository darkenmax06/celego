import { format, getISOWeek, getISOWeekYear, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Date fields of a card surfaced in list views (columns, grouping) and in the
 * selection export. Pure on purpose so it can be shared by client and server.
 */
export const CARD_DATE_FIELDS = [
  { key: "dispatchDate", label: "Fecha de despacho", withTime: false },
  { key: "slaDueDate", label: "Vencimiento SLA", withTime: false },
  { key: "fechaPreferenciaEntrega", label: "Preferencia de entrega", withTime: false },
  { key: "reassignedAt", label: "Fecha de reasignación", withTime: true },
  { key: "bizcochitoAt", label: "Fecha bizcochito", withTime: true },
  { key: "contractImageAt", label: "Fecha imagen contrato", withTime: true },
  { key: "createdAt", label: "Fecha de creación", withTime: true },
  { key: "updatedAt", label: "Última actualización", withTime: true },
] as const;

export type CardDateFieldKey = (typeof CARD_DATE_FIELDS)[number]["key"];

export type CardDateSource = Partial<Record<CardDateFieldKey, Date | string | null | undefined>> & {
  metadata?: unknown;
};

/**
 * Parses a stored date. A bare `yyyy-MM-dd` (the operativo preference date)
 * goes through `parseISO` so it stays on its local calendar day instead of
 * shifting to the previous day as `new Date("yyyy-MM-dd")` (UTC) would.
 */
export function parseCardDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : null;
}

function readPreferenceDate(card: CardDateSource): string | null {
  if (typeof card.fechaPreferenciaEntrega === "string") return card.fechaPreferenciaEntrega;
  const root = card.metadata && typeof card.metadata === "object" ? (card.metadata as Record<string, unknown>) : null;
  const operativo =
    root?.operativo && typeof root.operativo === "object" ? (root.operativo as Record<string, unknown>) : null;
  return typeof operativo?.fechaPreferenciaEntrega === "string" ? operativo.fechaPreferenciaEntrega : null;
}

export function getCardDate(card: CardDateSource, key: CardDateFieldKey): Date | null {
  if (key === "fechaPreferenciaEntrega") return parseCardDate(readPreferenceDate(card));
  const value = card[key];
  return parseCardDate(value instanceof Date || typeof value === "string" ? value : null);
}

export function formatCardDate(card: CardDateSource, key: CardDateFieldKey, empty = "-"): string {
  const date = getCardDate(card, key);
  if (!date) return empty;
  const field = CARD_DATE_FIELDS.find((item) => item.key === key);
  return format(date, field?.withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", { locale: es });
}

export type CardDateGranularity = "year" | "month" | "week" | "day";

export const CARD_DATE_GRANULARITIES: ReadonlyArray<{ value: CardDateGranularity; label: string }> = [
  { value: "year", label: "Año" },
  { value: "month", label: "Mes" },
  { value: "week", label: "Semana" },
  { value: "day", label: "Día" },
];

export const DATE_GROUP_PREFIX = "fecha:";
export const NO_DATE_GROUP_KEY = "SIN_FECHA";

/**
 * `fecha:<field>:<year|month|week|day>` — the `groupBy` level token for a date
 * bucket. Tokens never contain commas, so several levels can be comma-joined.
 */
export function dateGroupToken(key: CardDateFieldKey, granularity: CardDateGranularity) {
  return `${DATE_GROUP_PREFIX}${key}:${granularity}`;
}

function isGranularity(value: string | undefined): value is CardDateGranularity {
  return CARD_DATE_GRANULARITIES.some((item) => item.value === value);
}

export function parseDateGroupToken(
  token: string | undefined,
): { key: CardDateFieldKey; granularity: CardDateGranularity } | null {
  if (!token?.startsWith(DATE_GROUP_PREFIX)) return null;
  const [key, granularity, ...rest] = token.slice(DATE_GROUP_PREFIX.length).split(":");
  const field = CARD_DATE_FIELDS.find((item) => item.key === key);
  if (!field || rest.length || !isGranularity(granularity)) return null;
  return { key: field.key, granularity };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Buckets a card by year (`yyyy`), month (`yyyy-MM`), ISO week (`yyyy-Www`,
 * ISO week-numbering year) or day (`yyyy-MM-dd`). Keys of one granularity sort
 * chronologically as plain strings; labels are human readable in Spanish.
 */
export function getCardDateGroup(
  card: CardDateSource,
  key: CardDateFieldKey,
  granularity: CardDateGranularity,
): { key: string; label: string } {
  const date = getCardDate(card, key);
  if (!date) return { key: NO_DATE_GROUP_KEY, label: "Sin fecha" };
  switch (granularity) {
    case "year":
      return { key: format(date, "yyyy"), label: format(date, "yyyy") };
    case "month":
      return { key: format(date, "yyyy-MM"), label: capitalize(format(date, "MMMM yyyy", { locale: es })) };
    case "week": {
      const week = getISOWeek(date);
      const year = getISOWeekYear(date);
      return { key: `${year}-W${String(week).padStart(2, "0")}`, label: `Semana ${week}, ${year}` };
    }
    default:
      return { key: format(date, "yyyy-MM-dd"), label: format(date, "dd/MM/yyyy") };
  }
}

/** Chronological order with the "Sin fecha" bucket always last. */
export function compareDateGroupKeys(a: string, b: string) {
  if (a === b) return 0;
  if (a === NO_DATE_GROUP_KEY) return 1;
  if (b === NO_DATE_GROUP_KEY) return -1;
  return a < b ? -1 : 1;
}

/** Row labels of the date fields offered in the "Agrupar por" menu. */
const CARD_DATE_GROUP_LABELS: Partial<Record<CardDateFieldKey, string>> = {
  dispatchDate: "Fecha de despacho",
  slaDueDate: "Vencimiento SLA",
  fechaPreferenciaEntrega: "Preferencia de entrega",
  reassignedAt: "Reasignación",
  createdAt: "Creación",
  updatedAt: "Actualización",
};

export type DateGroupByOption = {
  field: string;
  label: string;
  children: Array<{ field: string; label: string }>;
};

/**
 * Group-by menu entry for a date field: one expandable row whose children are
 * the year/month/week/day level tokens.
 */
function dateGroupOption(key: CardDateFieldKey): DateGroupByOption {
  return {
    field: `${DATE_GROUP_PREFIX}${key}`,
    label: CARD_DATE_GROUP_LABELS[key] ?? key,
    children: CARD_DATE_GRANULARITIES.map((item) => ({ field: dateGroupToken(key, item.value), label: item.label })),
  };
}

/** Group-by menu entries for the date buckets offered in card views. */
export const CARD_DATE_GROUP_OPTIONS: DateGroupByOption[] = (
  Object.keys(CARD_DATE_GROUP_LABELS) as CardDateFieldKey[]
).map(dateGroupOption);

/** Short labels for the date range filter rows and chips. */
const CARD_DATE_FILTER_LABELS: Record<CardDateFieldKey, string> = {
  dispatchDate: "Despacho",
  slaDueDate: "Vencimiento SLA",
  fechaPreferenciaEntrega: "Preferencia de entrega",
  reassignedAt: "Reasignación",
  bizcochitoAt: "Bizcochito",
  contractImageAt: "Imagen contrato",
  createdAt: "Creación",
  updatedAt: "Actualización",
};

/**
 * `DateRangeFilter` rows for the given card date fields, in the given order.
 * Only pass fields the view's API whitelists (see `CARD_DATE_RANGE_FIELDS`).
 */
export function cardDateFilterOptions(keys: readonly CardDateFieldKey[]): Array<{ value: string; label: string }> {
  return keys.map((key) => ({ value: key, label: CARD_DATE_FILTER_LABELS[key] }));
}

/** Subset of `CARD_DATE_GROUP_OPTIONS` for the date fields a view actually loads, in the given order. */
export function cardDateGroupOptions(keys: readonly CardDateFieldKey[]): DateGroupByOption[] {
  return keys.map(dateGroupOption);
}
