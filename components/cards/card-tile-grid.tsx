"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Calls overhaul: flat or grouped (collapsible accordion) grid of card tiles.
 * Layout only — tiles are rendered by the caller through `renderItem`.
 */

export type TileGroup<T> = { groupKey: string; groupLabel: string; items: T[] };

type Props<T> = {
  items: T[];
  /** When set, renders one collapsible section per group instead of the flat grid. */
  groups?: TileGroup<T>[] | null;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  collapsedGroups?: Record<string, boolean>;
  onToggleGroup?: (groupKey: string) => void;
  loading?: boolean;
  emptyMessage?: string;
};

const GRID_CLASS = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/** Groups items by a key function, preserving first-seen group order and item order. */
export function groupTileItems<T>(
  items: T[],
  keyOf: (item: T) => { key: string; label: string },
): TileGroup<T>[] {
  const groups = new Map<string, TileGroup<T>>();
  for (const item of items) {
    const { key, label } = keyOf(item);
    const group = groups.get(key) ?? { groupKey: key, groupLabel: label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function CardTileGrid<T>({
  items,
  groups,
  getKey,
  renderItem,
  collapsedGroups = {},
  onToggleGroup,
  loading = false,
  emptyMessage = "No hay tarjetas que coincidan con estos filtros.",
}: Props<T>) {
  if (groups) {
    return (
      <div className="space-y-6">
        {groups.map((group) => {
          const isCollapsed = Boolean(collapsedGroups[group.groupKey]);
          return (
            <div key={group.groupKey} className="space-y-3">
              <button
                type="button"
                onClick={() => onToggleGroup?.(group.groupKey)}
                aria-expanded={!isCollapsed}
                className="flex w-full select-none items-center justify-between rounded-xl border border-slate-200 bg-slate-100/90 px-4 py-2.5 text-left transition hover:bg-slate-200/80"
              >
                <span className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-600" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Grupo:</span>
                  <span className="text-sm font-bold text-slate-900">{group.groupLabel}</span>
                  <span className="rounded-full bg-slate-200/90 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {group.items.length} {group.items.length === 1 ? "tarjeta" : "tarjetas"}
                  </span>
                </span>
              </button>
              {!isCollapsed ? (
                <div className={GRID_CLASS}>
                  {group.items.map((item) => (
                    <div key={getKey(item)} className="contents">
                      {renderItem(item)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {!groups.length && !loading ? <p className="py-8 text-center text-sm text-slate-500">{emptyMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className={GRID_CLASS}>
      {items.map((item) => (
        <div key={getKey(item)} className="contents">
          {renderItem(item)}
        </div>
      ))}
      {!items.length && !loading ? (
        <p className="col-span-full py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
      ) : null}
    </div>
  );
}
