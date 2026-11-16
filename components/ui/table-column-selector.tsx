"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { SlidersHorizontal, Check, ChevronDown, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColumnDef<T extends string = string> = {
  key: T;
  label: string;
  locked?: boolean; // If true, cannot be unchecked (e.g. primary identifier)
};

export type TableColumnSelectorProps<T extends string = string> = {
  /** Rendered in the given order; with `onReorder`, that order is the table's column order. */
  columns: readonly ColumnDef<T>[];
  visibleColumns: readonly T[] | T[];
  onChange: (visibleColumns: T[]) => void;
  /** Enables reordering (drag handle + move up/down buttons). Receives every column key in the new order. */
  onReorder?: (orderedKeys: T[]) => void;
  /** Shows a "Restablecer" action that restores the default layout. */
  onReset?: () => void;
  className?: string;
  title?: string;
};

function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function TableColumnSelector<T extends string = string>({
  columns,
  visibleColumns,
  onChange,
  onReorder,
  onReset,
  className,
  title = "Configurar columnas",
}: TableColumnSelectorProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragKeyRef = useRef<T | null>(null);
  const [dragKey, setDragKey] = useState<T | null>(null);
  const [overKey, setOverKey] = useState<T | null>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleColumn = (key: T) => {
    const isLocked = columns.find((c) => c.key === key)?.locked;
    if (isLocked) return;

    if (visibleColumns.includes(key)) {
      if (visibleColumns.length <= 1) return; // keep at least 1 column
      onChange(visibleColumns.filter((c) => c !== key));
    } else {
      onChange([...visibleColumns, key]);
    }
  };

  const selectAll = () => {
    onChange(columns.map((c) => c.key));
  };

  const keys = columns.map((c) => c.key);

  const moveColumn = (key: T, toIndex: number) => {
    const fromIndex = keys.indexOf(key);
    if (!onReorder || fromIndex < 0 || toIndex < 0 || toIndex >= keys.length || fromIndex === toIndex) return;
    onReorder(moveItem(keys, fromIndex, toIndex));
  };

  const endDrag = () => {
    dragKeyRef.current = null;
    setDragKey(null);
    setOverKey(null);
  };

  // Native HTML5 drag & drop; the up/down buttons are the keyboard alternative.
  const dragHandlers = (key: T) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLDivElement>) => {
      dragKeyRef.current = key;
      setDragKey(key);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
      }
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!dragKeyRef.current) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      setOverKey(key);
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const dragged = dragKeyRef.current;
      if (dragged) moveColumn(dragged, keys.indexOf(key));
      endDrag();
    },
    onDragEnd: endDrag,
  });

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
          isOpen
            ? "border-slate-400 bg-slate-100 text-slate-900 shadow-sm"
            : "border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
        )}
        title={title}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
        <span className="hidden sm:inline">Columnas</span>
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute right-0 z-50 mt-1.5 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100",
            onReorder ? "w-72" : "w-64",
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-1 text-xs">
            <span className="font-semibold text-slate-800">Mostrar columnas</span>
            <div className="flex items-center gap-3">
              {onReset ? (
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restablecer
                </button>
              ) : null}
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
              >
                Todas
              </button>
            </div>
          </div>
          {onReorder ? (
            <p className="px-1 pt-1.5 text-[11px] text-slate-400">Arrastra para cambiar el orden.</p>
          ) : null}

          <div
            className="mt-1.5 max-h-72 space-y-0.5 overflow-y-auto pr-1"
            role={onReorder ? "list" : undefined}
            aria-label={onReorder ? "Orden de columnas" : undefined}
          >
            {columns.map((column, index) => {
              const isVisible = visibleColumns.includes(column.key);
              const toggle = (
                <label
                  key={onReorder ? undefined : column.key}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleColumn(column.key);
                  }}
                  className={cn(
                    "flex cursor-pointer select-none items-center justify-between rounded-lg px-2 py-1.5 text-xs transition",
                    onReorder && "min-w-0 flex-1",
                    isVisible
                      ? "bg-slate-50 font-medium text-slate-900"
                      : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-700",
                    column.locked && "cursor-not-allowed opacity-75",
                  )}
                >
                  <span className="truncate">{column.label}</span>
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                      isVisible
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-300 bg-white",
                    )}
                  >
                    {isVisible ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                  </div>
                </label>
              );

              if (!onReorder) return toggle;

              return (
                <div
                  key={column.key}
                  role="listitem"
                  aria-label={column.label}
                  data-column-key={column.key}
                  {...dragHandlers(column.key)}
                  className={cn(
                    "flex items-center gap-0.5 rounded-lg",
                    dragKey === column.key && "opacity-50",
                    overKey === column.key && dragKey !== column.key && "ring-1 ring-indigo-300",
                  )}
                >
                  <span
                    aria-hidden="true"
                    title="Arrastrar para reordenar"
                    className="cursor-grab px-0.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  {toggle}
                  <button
                    type="button"
                    onClick={() => moveColumn(column.key, index - 1)}
                    disabled={index === 0}
                    aria-label={`Mover ${column.label} arriba`}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(column.key, index + 1)}
                    disabled={index === columns.length - 1}
                    aria-label={`Mover ${column.label} abajo`}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
