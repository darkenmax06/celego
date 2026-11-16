/**
 * Pure helpers for per-user table column layouts (order + visibility).
 *
 * A saved layout is untrusted input: it can come from an older release (a
 * column that no longer exists, such as the retired "acciones" column), from a
 * hand-crafted request, or predate columns added since. `mergeColumnPreferences`
 * is the single place that reconciles it with the table's current catalog, and
 * both the API (before storing/serving) and the client (before rendering) use it.
 */
export type TableColumnCatalogEntry = {
  key: string;
  label: string;
  /** Always visible; cannot be hidden (e.g. the primary identifier). */
  locked?: boolean;
  /** Visibility for users without a saved layout. Defaults to `true`. */
  defaultVisible?: boolean;
};

export type ColumnPreference = { key: string; visible: boolean };

function defaultVisibility(column: TableColumnCatalogEntry): boolean {
  return column.locked ? true : column.defaultVisible !== false;
}

/** Catalog order with each column's default visibility. */
export function defaultColumnPreferences(catalog: readonly TableColumnCatalogEntry[]): ColumnPreference[] {
  return catalog.map((column) => ({ key: column.key, visible: defaultVisibility(column) }));
}

/**
 * Reconciles a saved layout with the current catalog:
 * - entries with unknown keys (or malformed shapes) are dropped;
 * - duplicate keys keep their first occurrence;
 * - a non-boolean `visible` falls back to the column default;
 * - locked columns are always visible;
 * - catalog columns missing from the saved layout are appended, in catalog
 *   order, with their default visibility;
 * - if nothing ends up visible, the defaults are restored.
 */
export function mergeColumnPreferences(
  catalog: readonly TableColumnCatalogEntry[],
  saved: unknown,
): ColumnPreference[] {
  const byKey = new Map(catalog.map((column) => [column.key, column]));
  const seen = new Set<string>();
  const merged: ColumnPreference[] = [];

  if (Array.isArray(saved)) {
    for (const entry of saved) {
      if (!entry || typeof entry !== "object") continue;
      const { key, visible } = entry as { key?: unknown; visible?: unknown };
      if (typeof key !== "string" || seen.has(key)) continue;
      const column = byKey.get(key);
      if (!column) continue;
      seen.add(key);
      merged.push({
        key,
        visible: column.locked ? true : typeof visible === "boolean" ? visible : defaultVisibility(column),
      });
    }
  }

  for (const column of catalog) {
    if (!seen.has(column.key)) merged.push({ key: column.key, visible: defaultVisibility(column) });
  }

  if (!merged.some((column) => column.visible)) return defaultColumnPreferences(catalog);
  return merged;
}

/**
 * Converts the legacy "visible column keys" list (catalog-ordered rendering)
 * into a layout. Returns `null` when the value is not a usable list, so callers
 * can tell "nothing to migrate" apart from "migrate to these columns".
 */
export function columnPreferencesFromVisibleKeys(
  catalog: readonly TableColumnCatalogEntry[],
  visibleKeys: unknown,
): ColumnPreference[] | null {
  if (!Array.isArray(visibleKeys)) return null;
  const visible = new Set(visibleKeys.filter((key): key is string => typeof key === "string"));
  if (!catalog.some((column) => visible.has(column.key))) return null;
  return mergeColumnPreferences(
    catalog,
    catalog.map((column) => ({ key: column.key, visible: visible.has(column.key) })),
  );
}

/** Keys of the visible columns, in layout order. */
export function visibleColumnKeys(columns: readonly ColumnPreference[]): string[] {
  return columns.filter((column) => column.visible).map((column) => column.key);
}
