import type { ListRouteContract } from "./route-contract";

/**
 * Reference implementation of the pagination + envelope assembly the nine list
 * routes perform today, transcribed verbatim from their source:
 *
 *   const pageRaw = Number(searchParams.get("page") ?? "1");
 *   const pageSizeRaw = Number(searchParams.get("pageSize") ?? "<default>");
 *   const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
 *   const pageSize = Number.isFinite(pageSizeRaw)
 *     ? Math.min(<max>, Math.max(1, Math.trunc(pageSizeRaw)))
 *     : <default>;
 *   const totalPages = Math.max(1, Math.ceil(total / pageSize));
 *
 * The route handlers themselves cannot be imported into vitest today (they use
 * `@/` imports and no vitest resolver alias exists yet), so this module is the
 * executable freeze of that behaviour. `pagination-contract.test.ts` re-anchors
 * it against the real route sources.
 */

export type ResolvedPagination = {
  page: number;
  pageSize: number;
  /** True when BOTH params were absent — the mensajeros dual-mode condition. */
  unpaginated: boolean;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function resolvePagination(
  contract: ListRouteContract,
  params: URLSearchParams,
): ResolvedPagination {
  const pageParam = params.get("page");
  const pageSizeParam = params.get("pageSize");

  const pageRaw = Number(pageParam ?? "1");
  const pageSizeRaw = Number(pageSizeParam ?? String(contract.defaultPageSize));

  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(contract.maxPageSize, Math.max(1, Math.trunc(pageSizeRaw)))
    : contract.defaultPageSize;

  return { page, pageSize, unpaginated: pageParam === null && pageSizeParam === null };
}

export function buildPagination(
  contract: ListRouteContract,
  params: URLSearchParams,
  total: number,
): Pagination {
  const { page, pageSize } = resolvePagination(contract, params);
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Deterministic placeholder rows; goldens freeze SHAPE, never live data. */
function goldenRows(count: number): { id: string }[] {
  return Array.from({ length: count }, (_unused, index) => ({ id: `row-${index + 1}` }));
}

/**
 * Assembles the envelope with keys in the SAME order the route emits them, so a
 * snapshot diff surfaces key reordering as well as key addition or removal.
 */
export function buildGoldenEnvelope(
  contract: ListRouteContract,
  params: URLSearchParams,
  total: number,
): Record<string, unknown> {
  const resolved = resolvePagination(contract, params);
  const rowCount = Math.max(
    0,
    Math.min(resolved.pageSize, total - (resolved.page - 1) * resolved.pageSize),
  );

  if (contract.allowUnpaginated && resolved.unpaginated) {
    // No `pagination` key at all. Many callers depend on this exact shape.
    return { [contract.listKey]: goldenRows(total) };
  }

  const envelope: Record<string, unknown> = {};
  for (const key of contract.envelopeKeys) {
    if (key === contract.listKey) envelope[key] = goldenRows(rowCount);
    else if (key === "pagination") envelope[key] = buildPagination(contract, params, total);
    else if (key === "pendingCount") envelope[key] = 0;
    else if (key === "latest") envelope[key] = null;
    else if (key === "tab") envelope[key] = "pendientes";
    else if (key === "currentUserId") envelope[key] = "golden-user";
    else envelope[key] = null;
  }
  return envelope;
}
