"use client";

import { UserRound } from "lucide-react";
import { ASIGNADO_ME } from "@/lib/filters/card-facets";
import type { ListFilters } from "@/lib/use-card-list-filters";
import { cn } from "@/lib/utils";

/**
 * Calls overhaul: one-click shortcut for the `asignado=ME` facet of the
 * `llamadas` filter preset. Toggling resets pagination to page 1.
 */
export function AssignedToMeChip({
  filters,
  setFilters,
}: {
  filters: ListFilters;
  setFilters: (updater: (prev: ListFilters) => ListFilters) => void;
}) {
  const active = filters.asignado === ASIGNADO_ME;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() =>
        setFilters((prev) => {
          const next: ListFilters = { ...prev, page: "1" };
          if (active) delete next.asignado;
          else next.asignado = ASIGNADO_ME;
          return next;
        })
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
        active
          ? "border-blue-600 bg-blue-600 text-white shadow-2xs"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      <UserRound className="h-3.5 w-3.5" />
      Asignadas a mí
    </button>
  );
}
