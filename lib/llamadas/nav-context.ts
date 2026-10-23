/**
 * Calls overhaul: prev/next navigation between call detail screens.
 *
 * Before opening `/llamadas/[cardId]`, a list page (operativo, SLA vencidas)
 * stores the ordered ids it is showing plus how to fetch neighbouring pages
 * under `sessionStorage["llamadas:nav"]`. The detail screen reads it to move
 * to the previous / next card, extending the list across page boundaries,
 * and to return to the origin list with its filters. Missing / corrupt
 * context degrades gracefully to "no prev/next".
 */

export const LLAMADAS_NAV_KEY = "llamadas:nav";

export type LlamadasNavSource = {
  /** List API the ids came from, e.g. `/api/operativo/contacto`. */
  endpoint: string;
  /** Query params of that list WITHOUT `page` (filters, tab, pageSize...). */
  params: Record<string, string>;
  /** Response array holding the rows (`cards` for operativo, `rows` for SLA vencidas). */
  listKey: string;
  /** Row field with the card id (`cardId` for operativo, `id` for SLA vencidas). */
  idKey: string;
  pageSize: number;
  total: number;
  totalPages: number;
  /** First / last page already merged into `ids`. */
  firstPage: number;
  lastPage: number;
};

export type LlamadasNavContext = {
  ids: string[];
  /** List URL (path + query) to return to with "Volver". */
  originUrl: string;
  originLabel: string;
  source?: LlamadasNavSource;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function writeNavContext(context: LlamadasNavContext, storage: StorageLike | null = defaultStorage()) {
  try {
    storage?.setItem(LLAMADAS_NAV_KEY, JSON.stringify(context));
  } catch {
    // Storage full / blocked: navigation simply falls back to no prev/next.
  }
}

export function readNavContext(storage: StorageLike | null = defaultStorage()): LlamadasNavContext | null {
  try {
    const raw = storage?.getItem(LLAMADAS_NAV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LlamadasNavContext>;
    if (!isStringArray(parsed.ids) || typeof parsed.originUrl !== "string") return null;
    return {
      ids: parsed.ids,
      originUrl: parsed.originUrl,
      originLabel: typeof parsed.originLabel === "string" ? parsed.originLabel : "Volver",
      source: parsed.source && typeof parsed.source.endpoint === "string" ? parsed.source : undefined,
    };
  } catch {
    return null;
  }
}

/** Card ids of a list response, in order, skipping rows without a card (e.g. unlinked urgent cases). */
export function extractIds(rows: unknown, idKey: string): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>)[idKey] : null))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** 0-based position of `id` across the whole filtered list (not just the loaded slice). */
export function absoluteIndex(context: LlamadasNavContext, id: string): number {
  const local = context.ids.indexOf(id);
  if (local < 0) return -1;
  const offset = context.source ? (context.source.firstPage - 1) * context.source.pageSize : 0;
  return offset + local;
}

export function navTotal(context: LlamadasNavContext): number {
  return Math.max(context.source?.total ?? 0, context.ids.length);
}

export function canExtend(context: LlamadasNavContext, direction: "prev" | "next"): boolean {
  const source = context.source;
  if (!source) return false;
  return direction === "next" ? source.lastPage < source.totalPages : source.firstPage > 1;
}

/**
 * Fetches the page before / after the loaded slice and merges its ids.
 * Returns `null` when there is nothing more to load or the request fails.
 */
export async function extendNavContext(
  context: LlamadasNavContext,
  direction: "prev" | "next",
  fetchImpl: typeof fetch = fetch,
): Promise<LlamadasNavContext | null> {
  const source = context.source;
  if (!source || !canExtend(context, direction)) return null;
  const page = direction === "next" ? source.lastPage + 1 : source.firstPage - 1;
  const params = new URLSearchParams(source.params);
  params.set("page", String(page));
  params.set("pageSize", String(source.pageSize));
  try {
    const res = await fetchImpl(`${source.endpoint}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const pageIds = extractIds(json[source.listKey], source.idKey).filter((id) => !context.ids.includes(id));
    const pagination = json.pagination as { total?: number; totalPages?: number } | undefined;
    return {
      ...context,
      ids: direction === "next" ? [...context.ids, ...pageIds] : [...pageIds, ...context.ids],
      source: {
        ...source,
        total: pagination?.total ?? source.total,
        totalPages: pagination?.totalPages ?? source.totalPages,
        firstPage: direction === "prev" ? page : source.firstPage,
        lastPage: direction === "next" ? page : source.lastPage,
      },
    };
  } catch {
    return null;
  }
}

export function callDetailHref(cardId: string, options: { llamar?: boolean } = {}): string {
  return `/llamadas/${encodeURIComponent(cardId)}${options.llamar ? "?llamar=1" : ""}`;
}
