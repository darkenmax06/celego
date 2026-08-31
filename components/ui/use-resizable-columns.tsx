"use client";

import React, { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

export type ColumnWidthMap = Record<string, number>;

export function useResizableColumns(
  storageKey: string,
  defaultWidths: ColumnWidthMap,
  minColumnWidth = 60,
) {
  const [widths, setWidths] = useState<ColumnWidthMap>(() => {
    if (typeof window === "undefined") return defaultWidths;
    try {
      const saved = localStorage.getItem(`table-col-widths:${storageKey}`);
      if (saved) {
        return { ...defaultWidths, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return defaultWidths;
  });

  const updateWidth = useCallback(
    (columnKey: string, newWidth: number) => {
      setWidths((prev) => {
        const next = {
          ...prev,
          [columnKey]: Math.max(minColumnWidth, Math.round(newWidth)),
        };
        try {
          localStorage.setItem(`table-col-widths:${storageKey}`, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey, minColumnWidth],
  );

  return { widths, updateWidth };
}

export type ResizableHeaderProps = {
  columnKey: string;
  label: string;
  width?: number;
  onResize?: (columnKey: string, width: number) => void;
  className?: string;
  minWidth?: number;
  children?: React.ReactNode;
};

export function ResizableHeader({
  columnKey,
  label,
  width,
  onResize,
  className,
  minWidth = 60,
  children,
}: ResizableHeaderProps) {
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = width ?? 120;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(minWidth, startWidth + delta);
        if (onResize) {
          onResize(columnKey, nextWidth);
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [columnKey, width, minWidth, onResize],
  );

  return (
    <th
      style={{ width: width ? `${width}px` : undefined, minWidth: width ? `${width}px` : undefined }}
      className={cn(
        "group relative select-none whitespace-nowrap pb-2.5 pt-1 font-semibold text-slate-600 transition-colors overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between pr-2 min-w-0">
        <span className="truncate" title={typeof children === "string" ? children : label}>{children ?? label}</span>
      </div>

      {/* Resize Handle */}
      {onResize ? (
        <div
          onMouseDown={startResizing}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute right-0 top-0 h-full w-2.5 cursor-col-resize select-none touch-none",
            "after:absolute after:right-0 after:top-1.5 after:bottom-1.5 after:w-0.5 after:bg-slate-200 group-hover:after:bg-slate-400",
            isResizing && "after:bg-indigo-600 after:w-1 z-20",
          )}
          title="Arrastra para redimensionar columna"
        />
      ) : null}
    </th>
  );
}
