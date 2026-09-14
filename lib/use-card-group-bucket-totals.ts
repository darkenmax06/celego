"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * SDD card-groups — Stage C, Task C2.
 *
 * True per-group totals for the "Grupo" group-by, fetched from
 * `GET /api/list-query/group-by?by=grupo`.
 *
 * The browser can only bucket the rows it fetched, so with a page of 50 the
 * buckets would otherwise suggest those are all the groups that exist and that
 * their sizes are the page's sizes. This hook answers only the half that the
 * server can answer honestly: how many matching cards each group really holds.
 *
 * `null` means "no server total" (still loading, request failed, or a resource
 * that cannot answer the question) and must be rendered as such — never as a
 * fabricated 0.
 */
export type CardGroupBucketTotals = Readonly<Record<string, number>> | null;

/** Filter keys that describe the page, not the predicate. */
const NON_PREDICATE_KEYS = new Set(["page", "pageSize", "groupBy", "view"]);

export function useCardGroupBucketTotals(
  resource: string,
  filters: Record<string, string>,
  enabled: boolean,
): CardGroupBucketTotals {
  const [totals, setTotals] = useState<CardGroupBucketTotals>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("resource", resource);
    params.set("by", "grupo");
    for (const [key, value] of Object.entries(filters)) {
      if (!value || value === "ALL" || NON_PREDICATE_KEYS.has(key)) continue;
      params.set(key, value);
    }
    return params.toString();
  }, [resource, filters]);

  useEffect(() => {
    if (!enabled) {
      setTotals(null);
      return;
    }

    let cancelled = false;
    setTotals(null);

    (async () => {
      try {
        const response = await fetch(`/api/list-query/group-by?${query}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { groups?: { key: string; count: number }[] };
        if (cancelled || !body.groups) return;
        setTotals(Object.fromEntries(body.groups.map((group) => [group.key, group.count])));
      } catch {
        // A missing total is rendered as missing; it is never invented.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, query]);

  return totals;
}
