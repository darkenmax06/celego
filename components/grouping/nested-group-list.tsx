"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupNode } from "@/lib/grouping";

/** Collapse state for nested groups, keyed by the full group path. */
export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isCollapsed = useCallback((path: string) => Boolean(collapsed[path]), [collapsed]);
  const toggle = useCallback(
    (path: string) => setCollapsed((prev) => ({ ...prev, [path]: !prev[path] })),
    [],
  );
  return { isCollapsed, toggle };
}

type NestedGroupListProps<T> = {
  groups: GroupNode<T>[];
  /** `table` renders `<tr>` headers (place it inside `<tbody>`); `blocks` renders stacked `<div>` sections. */
  variant: "table" | "blocks";
  isCollapsed: (path: string) => boolean;
  onToggle: (path: string) => void;
  /** Renders the rows of an innermost group (`<tr>`s for `table`). */
  renderRows: (rows: T[], group: GroupNode<T>) => ReactNode;
  /** Count badge text, e.g. `3 tarjetas`. Defaults to the bare number. Receives the node, e.g. to show a server total. */
  countLabel?: (count: number, group: GroupNode<T>) => string;
  /** Column span of the header row (`table` only). */
  colSpan?: number;
  /** Enables a checkbox on every group header that selects all rows of its subtree. */
  selection?: GroupSelection<T>;
};

export type GroupSelection<T> = {
  getRowId: (row: T) => string;
  isSelected: (id: string) => boolean;
  /** Called with every row id of the group and whether they must become selected. */
  onChange: (ids: string[], checked: boolean) => void;
};

const INDENT_PX = 20;

function GroupSelectCheckbox<T>({ group, selection }: { group: GroupNode<T>; selection: GroupSelection<T> }) {
  const ref = useRef<HTMLInputElement>(null);
  const ids = group.rows.map(selection.getRowId);
  const selectedCount = ids.filter((id) => selection.isSelected(id)).length;
  const allSelected = ids.length > 0 && selectedCount === ids.length;
  const partial = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      aria-label={`Seleccionar grupo ${group.label}`}
      onClick={(event) => event.stopPropagation()}
      onChange={() => selection.onChange(ids, !allSelected)}
      className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
    />
  );
}

function GroupHeaderContent<T>({
  group,
  collapsed,
  countLabel,
  selection,
}: {
  group: GroupNode<T>;
  collapsed: boolean;
  countLabel?: (count: number, group: GroupNode<T>) => string;
  selection?: GroupSelection<T>;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <div className="flex items-center gap-2">
      {selection ? <GroupSelectCheckbox group={group} selection={selection} /> : null}
      <Chevron className="h-4 w-4 shrink-0 text-slate-600" />
      {group.depth === 0 ? (
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Grupo:</span>
      ) : null}
      <span className={cn("font-bold text-slate-900", group.depth === 0 ? "text-sm" : "text-[13px]")}>
        {group.label}
      </span>
      <span className="rounded-full bg-slate-200/90 px-2 py-0.5 text-xs font-semibold text-slate-700">
        {countLabel ? countLabel(group.count, group) : group.count}
      </span>
    </div>
  );
}

/**
 * Collapsible, indented headers for nested groups built by `groupRowsNested`.
 * Each level is indented under its parent and shows the row count of its subtree.
 */
export function NestedGroupList<T>({
  groups,
  variant,
  isCollapsed,
  onToggle,
  renderRows,
  countLabel,
  colSpan,
  selection,
}: NestedGroupListProps<T>) {
  if (variant === "table") {
    const renderTableNodes = (nodes: GroupNode<T>[]): ReactNode =>
      nodes.map((group) => {
        const collapsed = isCollapsed(group.path);
        return (
          <Fragment key={group.path}>
            <tr
              onClick={() => onToggle(group.path)}
              className={cn(
                "cursor-pointer select-none border-y border-slate-200 font-semibold text-slate-900 transition",
                group.depth === 0 ? "bg-slate-100/90 hover:bg-slate-200/80" : "bg-slate-50 hover:bg-slate-100",
              )}
            >
              <td colSpan={colSpan} className="px-3 py-2.5">
                <div style={{ paddingLeft: group.depth * INDENT_PX }}>
                  <GroupHeaderContent group={group} collapsed={collapsed} countLabel={countLabel} selection={selection} />
                </div>
              </td>
            </tr>
            {collapsed
              ? null
              : group.children.length
                ? renderTableNodes(group.children)
                : renderRows(group.rows, group)}
          </Fragment>
        );
      });
    return <>{renderTableNodes(groups)}</>;
  }

  const renderBlockNodes = (nodes: GroupNode<T>[]): ReactNode =>
    nodes.map((group) => {
      const collapsed = isCollapsed(group.path);
      return (
        <div key={group.path} className="space-y-3">
          <div
            onClick={() => onToggle(group.path)}
            className={cn(
              "flex cursor-pointer select-none items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 transition",
              group.depth === 0 ? "bg-slate-100/90 hover:bg-slate-200/80" : "bg-slate-50 hover:bg-slate-100",
            )}
          >
            <GroupHeaderContent group={group} collapsed={collapsed} countLabel={countLabel} selection={selection} />
          </div>
          {collapsed ? null : group.children.length ? (
            <div className="space-y-3 border-l-2 border-slate-100 pl-4">{renderBlockNodes(group.children)}</div>
          ) : (
            renderRows(group.rows, group)
          )}
        </div>
      );
    });
  return <>{renderBlockNodes(groups)}</>;
}
