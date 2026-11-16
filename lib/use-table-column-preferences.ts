"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  columnPreferencesFromVisibleKeys,
  defaultColumnPreferences,
  mergeColumnPreferences,
  type ColumnPreference,
  type TableColumnCatalogEntry,
} from "@/lib/table-columns/column-preferences";
import { readPersistentValue, removePersistentValue } from "@/lib/use-persistent-state";

const SAVE_DEBOUNCE_MS = 600;

type Options = {
  /**
   * `usePersistentState` key of the pre-server "visible column keys" list.
   * Migrated once to the server when the user has no saved layout yet.
   */
  legacyStorageKey?: string;
};

export type UseTableColumnPreferences = {
  /** Ordered layout, always reconciled with the catalog. */
  columns: ColumnPreference[];
  setColumns: (next: ColumnPreference[]) => void;
  resetColumns: () => void;
  /** True once the server layout (or its fallback) has been applied. */
  loaded: boolean;
};

/**
 * Column order + visibility of a table, saved per user on the server
 * (`/api/user-preferences/tables/[tableKey]`). Starts from the catalog defaults,
 * applies the saved layout on mount, and saves changes optimistically with a
 * debounce. A change made before the saved layout arrives wins over it.
 *
 * `catalog` must be referentially stable (a module constant).
 */
export function useTableColumnPreferences(
  tableKey: string,
  catalog: readonly TableColumnCatalogEntry[],
  { legacyStorageKey }: Options = {},
): UseTableColumnPreferences {
  const url = `/api/user-preferences/tables/${encodeURIComponent(tableKey)}`;

  const [columns, setColumnsState] = useState<ColumnPreference[]>(() => defaultColumnPreferences(catalog));
  const [loaded, setLoaded] = useState(false);
  const dirtyRef = useRef(false);
  const pendingRef = useRef<ColumnPreference[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (next: ColumnPreference[]): Promise<boolean> => {
      try {
        const response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columns: next }),
          keepalive: true,
        });
        return Boolean(response?.ok);
      } catch {
        return false;
      }
    },
    [url],
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) void save(pending);
  }, [save]);

  useEffect(() => {
    let cancelled = false;
    const legacyLayout = () =>
      legacyStorageKey
        ? columnPreferencesFromVisibleKeys(catalog, readPersistentValue<unknown>(legacyStorageKey))
        : null;

    (async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("table preferences request failed");
        const body = (await response.json()) as { saved?: boolean; columns?: unknown };
        if (cancelled || dirtyRef.current) return;
        if (body.saved) {
          setColumnsState(mergeColumnPreferences(catalog, body.columns));
          return;
        }
        const legacy = legacyLayout();
        if (legacy) {
          setColumnsState(legacy);
          if (await save(legacy)) removePersistentValue(legacyStorageKey!);
        }
      } catch {
        // Server unavailable: keep working with the local layout, if any.
        const legacy = legacyLayout();
        if (!cancelled && !dirtyRef.current && legacy) setColumnsState(legacy);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, legacyStorageKey, save, catalog]);

  // Never drop a pending save when the table unmounts.
  useEffect(() => flush, [flush]);

  const setColumns = useCallback(
    (next: ColumnPreference[]) => {
      const merged = mergeColumnPreferences(catalog, next);
      dirtyRef.current = true;
      setColumnsState(merged);
      pendingRef.current = merged;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush, catalog],
  );

  const resetColumns = useCallback(
    () => setColumns(defaultColumnPreferences(catalog)),
    [setColumns, catalog],
  );

  return { columns, setColumns, resetColumns, loaded };
}
