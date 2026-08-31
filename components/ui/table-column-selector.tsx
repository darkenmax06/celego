"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Check, Eye, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColumnDef<T extends string = string> = {
  key: T;
  label: string;
  locked?: boolean; // If true, cannot be unchecked (e.g. primary identifier)
};

export type TableColumnSelectorProps<T extends string = string> = {
  columns: readonly ColumnDef<T>[];
  visibleColumns: readonly T[] | T[];
  onChange: (visibleColumns: T[]) => void;
  className?: string;
  title?: string;
};

export function TableColumnSelector<T extends string = string>({
  columns,
  visibleColumns,
  onChange,
  className,
  title = "Configurar columnas",
}: TableColumnSelectorProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        <div className="absolute right-0 z-50 mt-1.5 w-64 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-1 text-xs">
            <span className="font-semibold text-slate-800">Mostrar columnas</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
            >
              Todas
            </button>
          </div>

          <div className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {columns.map((column) => {
              const isVisible = visibleColumns.includes(column.key);
              return (
                <label
                  key={column.key}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleColumn(column.key);
                  }}
                  className={cn(
                    "flex cursor-pointer select-none items-center justify-between rounded-lg px-2 py-1.5 text-xs transition",
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
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
