"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Calls overhaul: list filters that live in the URL.
 *
 * - Read once on mount from the current query string (on top of `defaults`).
 * - Written back with `router.replace` (debounced) whenever they change,
 *   omitting empty / `ALL` values and values equal to their default, so a
 *   pristine list keeps a clean URL and a filtered one is shareable and
 *   survives a round-trip to a detail screen.
 */

export type ListFilters = Record<string, string>;

/** Query keys owned by other features (e.g. the call wizard), never treated as filters. */
const RESERVED_KEYS = new Set(["llamar"]);

export function readFiltersFromSearch(
  search: Pick<URLSearchParams, "forEach">,
  defaults: ListFilters,
): ListFilters {
  const next: ListFilters = { ...defaults };
  search.forEach((value, key) => {
    if (RESERVED_KEYS.has(key)) return;
    if (value.trim()) next[key] = value;
  });
  return next;
}

export function serializeFilters(filters: ListFilters, defaults: ListFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value || value === "ALL") continue;
    if (defaults[key] === value) continue;
    params.set(key, value);
  }
  return params.toString();
}

export type UseCardListFilters = {
  filters: ListFilters;
  setFilters: React.Dispatch<React.SetStateAction<ListFilters>>;
  resetFilters: () => void;
};

export function useCardListFilters(options: { defaults: ListFilters; debounceMs?: number }): UseCardListFilters {
  const { debounceMs = 250 } = options;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Defaults are captured once: callers usually pass an inline literal.
  const [defaults] = useState<ListFilters>(options.defaults);
  const [filters, setFilters] = useState<ListFilters>(() =>
    readFiltersFromSearch(searchParams ?? new URLSearchParams(), defaults),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const query = serializeFilters(filters, defaults);
      const current = typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
      if (query === current) return;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [filters, defaults, pathname, router, debounceMs]);

  const resetFilters = useCallback(() => setFilters({ ...defaults }), [defaults]);

  return { filters, setFilters, resetFilters };
}
