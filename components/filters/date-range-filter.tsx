"use client";

import { useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dateRangeChipLabel,
  dateRangeChipRemovalKeys,
  dateRangeSummary,
  readDateRanges,
  withDateRange,
  type DateRangeFieldOption,
  type DateRangeMap,
  type DateRangeValue,
} from "@/lib/date-range-params";

type DateRangeFilterProps = {
  /** Whitelisted date fields, each rendered as its own expandable row. */
  fields: readonly DateRangeFieldOption[];
  /** Active ranges by field; several fields may be active at once (AND). */
  value: DateRangeMap;
  /** `range` is `undefined` when the field is cleared. */
  onChange: (field: string, range: DateRangeValue | undefined) => void;
  className?: string;
};

function normalizeRange(range: DateRangeValue): DateRangeValue | undefined {
  return range.from || range.to ? range : undefined;
}

/**
 * Date filters for the FilterBar dropdown: one expandable row per date field,
 * mirroring the facet rows. Each row is independent.
 */
export function DateRangeFilter({ fields, value, onChange, className }: DateRangeFilterProps) {
  const [expandedField, setExpandedField] = useState<string | null>(null);

  return (
    <div className={cn("space-y-1 text-xs", className)}>
      {fields.map((item) => {
        const range = value[item.value] ?? {};
        const isActive = Boolean(range.from || range.to);
        const isExpanded = expandedField === item.value;
        const invalid = Boolean(range.from && range.to && range.from > range.to);

        return (
          <div key={item.value} className="rounded-lg">
            <button
              type="button"
              onClick={() => setExpandedField(isExpanded ? null : item.value)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-medium transition hover:bg-slate-100",
                isActive ? "bg-indigo-50/70 text-indigo-900" : "text-slate-700",
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded border",
                    isActive ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300",
                  )}
                >
                  {isActive ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
                </div>
                <span>
                  {item.label}
                  {isActive ? `: ${dateRangeSummary(range)}` : ""}
                </span>
              </div>
              <ChevronRight
                className={cn("h-3 w-3 text-slate-400 transition-transform", isExpanded && "rotate-90")}
              />
            </button>

            {isExpanded ? (
              <div className="my-1 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2 pl-6">
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                    Desde
                    <input
                      type="date"
                      aria-label={`${item.label} desde`}
                      value={range.from ?? ""}
                      max={range.to || undefined}
                      onChange={(event) =>
                        onChange(item.value, normalizeRange({ from: event.target.value || undefined, to: range.to }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-800"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                    Hasta
                    <input
                      type="date"
                      aria-label={`${item.label} hasta`}
                      value={range.to ?? ""}
                      min={range.from || undefined}
                      onChange={(event) =>
                        onChange(item.value, normalizeRange({ from: range.from, to: event.target.value || undefined }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-800"
                    />
                  </label>
                </div>
                {isActive ? (
                  <button
                    type="button"
                    onClick={() => onChange(item.value, undefined)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
                  >
                    <X className="h-3 w-3" />
                    Limpiar
                  </button>
                ) : null}
                {invalid ? (
                  <p className="text-[11px] font-medium text-rose-600">La fecha inicial es posterior a la final.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Wires `DateRangeFilter` into a `FilterBar`: the dropdown rows, one chip per
 * active field and chip removal that clears both bounds. Spread the result
 * into `<FilterBar />`. `chipLabel` falls back to `fallbackChipLabel` for
 * non-date keys.
 */
export function dateRangeFilterBarProps({
  fields,
  filters,
  onChange,
  fallbackChipLabel,
}: {
  fields: readonly DateRangeFieldOption[];
  filters: Record<string, string>;
  /** Receives the full next filter record (legacy date keys already migrated). */
  onChange: (next: Record<string, string>) => void;
  fallbackChipLabel?: (key: string, value: string) => string | null | undefined;
}) {
  return {
    chipLabel: (key: string, value: string) => {
      const label = dateRangeChipLabel(filters, key, fields);
      return label !== undefined ? label : fallbackChipLabel?.(key, value);
    },
    chipRemovalKeys: dateRangeChipRemovalKeys,
    filterMenuExtra: (
      <DateRangeFilter
        fields={fields}
        value={readDateRanges(filters)}
        onChange={(field, range) => onChange(withDateRange(filters, field, range))}
      />
    ),
  };
}
