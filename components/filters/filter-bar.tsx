"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Search,
  X,
  Filter,
  ChevronDown,
  ChevronRight,
  Layers,
  Star,
  Trash2,
  List,
  LayoutGrid,
  Columns,
  Check,
  Plus,
  BookmarkPlus,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FacetConfig = {
  field: string;
  label: string;
  options?: Array<{ label: string; value: string }>;
  /** Allows selecting more than one value for this facet (comma-joined, `{ in: [...] }` on the backend). */
  multi?: boolean;
};

function facetValues(val: string | undefined) {
  return (val ?? "").split(",").filter(Boolean);
}

function formatFacetValue(facet: FacetConfig | undefined, val: string) {
  if (!facet?.multi) return val;
  const parts = facetValues(val);
  if (parts.length <= 2) return parts.join(", ");
  return `${parts.length} seleccionados`;
}

export type GroupByConfig = {
  field: string;
  label: string;
};

export type ViewType = "list" | "cards" | "kanban" | "pivot" | "calendar" | "timeline" | "grid";

export type SavedFilterItem = {
  id: string;
  name: string;
  filters: Record<string, string>;
  isDefault: boolean;
};

export type FilterBarProps = {
  resource: string;
  sectionKey: string;
  filters: Record<string, string>;
  onFilterChange: (nextFilters: Record<string, string>) => void;
  onReset?: () => void;
  facets?: FacetConfig[];
  groupByOptions?: GroupByConfig[];
  searchPlaceholder?: string;
  allowedViews?: ViewType[];
  currentView?: ViewType;
  onViewChange?: (nextView: ViewType) => void;
  className?: string;
};

export function FilterBar({
  resource,
  sectionKey,
  filters,
  onFilterChange,
  onReset,
  facets = [],
  groupByOptions = [],
  searchPlaceholder = "Buscar...",
  allowedViews,
  currentView,
  onViewChange,
  className,
}: FilterBarProps) {
  const [searchVal, setSearchVal] = useState(filters.q || "");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [facetOptions, setFacetOptions] = useState<Record<string, string[]>>({});
  const [activeFacetSubmenu, setActiveFacetSubmenu] = useState<string | null>(null);
  const [savedFilters, setSavedFilters] = useState<SavedFilterItem[]>([]);
  const [isSavingFilter, setIsSavingFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");
  const [isDefaultFilter, setIsDefaultFilter] = useState(false);
  const [customFilterField, setCustomFilterField] = useState("");
  const [customFilterValue, setCustomFilterValue] = useState("");
  const [customGroupField, setCustomGroupField] = useState("");
  const [, startTransition] = useTransition();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal search input if external filters.q changes
  useEffect(() => {
    setSearchVal(filters.q || "");
  }, [filters.q]);

  // Click outside listener to close the Odoo dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
        setActiveFacetSubmenu(null);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  // Load distinct values for each facet field
  useEffect(() => {
    let isMounted = true;
    async function loadFacets() {
      for (const facet of facets) {
        if (facet.options) continue; // static options provided
        try {
          const res = await fetch(
            `/api/list-query/distinct?resource=${encodeURIComponent(resource)}&field=${encodeURIComponent(facet.field)}`,
          );
          if (!res.ok) continue;
          const json = await res.json();
          if (isMounted && Array.isArray(json.values)) {
            setFacetOptions((prev) => ({
              ...prev,
              [facet.field]: json.values.map(String),
            }));
          }
        } catch {
          // ignore
        }
      }
    }
    void loadFacets();
    return () => {
      isMounted = false;
    };
  }, [resource, facets]);

  // Load user saved filters for this sectionKey
  useEffect(() => {
    let isMounted = true;
    async function loadSavedFilters() {
      try {
        const res = await fetch(
          `/api/user-preferences/filters?sectionKey=${encodeURIComponent(sectionKey)}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (isMounted && Array.isArray(json.filters)) {
          setSavedFilters(json.filters);
        }
      } catch {
        // ignore
      }
    }
    void loadSavedFilters();
    return () => {
      isMounted = false;
    };
  }, [sectionKey]);

  // Load user saved view preference on mount if onViewChange provided
  useEffect(() => {
    if (!onViewChange) return;
    let isMounted = true;
    async function loadViewPref() {
      try {
        const res = await fetch(
          `/api/user-preferences/views?sectionKey=${encodeURIComponent(sectionKey)}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (
          isMounted &&
          json.viewType &&
          allowedViews?.includes(json.viewType as ViewType) &&
          onViewChange
        ) {
          onViewChange(json.viewType as ViewType);
        }
      } catch {
        // ignore
      }
    }
    void loadViewPref();
    return () => {
      isMounted = false;
    };
  }, [sectionKey, allowedViews, onViewChange]);

  const handleSearchChange = (value: string) => {
    setSearchVal(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      startTransition(() => {
        const next = { ...filters };
        if (value.trim()) {
          next.q = value.trim();
        } else {
          delete next.q;
        }
        onFilterChange(next);
      });
    }, 300);
  };

  const handleClearAll = () => {
    setSearchVal("");
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (onReset) {
      onReset();
    } else {
      onFilterChange({ page: "1", pageSize: filters.pageSize || "25" });
    }
  };

  const handleRemoveChip = (key: string) => {
    const next = { ...filters };
    delete next[key];
    if (key === "q") setSearchVal("");
    onFilterChange(next);
  };

  const handleFacetToggle = (field: string, value: string) => {
    const facet = facets.find((f) => f.field === field);
    const next = { ...filters };
    if (facet?.multi) {
      const current = facetValues(next[field]);
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length) {
        next[field] = updated.join(",");
      } else {
        delete next[field];
      }
    } else if (next[field] === value) {
      delete next[field];
    } else {
      next[field] = value;
    }
    onFilterChange(next);
  };

  const handleGroupByToggle = (field: string) => {
    const next = { ...filters };
    if (next.groupBy === field) {
      delete next.groupBy;
    } else {
      next.groupBy = field;
    }
    onFilterChange(next);
  };

  const handleApplyCustomGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGroupField) return;
    handleGroupByToggle(customGroupField);
    setCustomGroupField("");
  };

  const handleSaveCurrentFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilterName.trim()) return;

    try {
      const res = await fetch("/api/user-preferences/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey,
          name: newFilterName.trim(),
          filters,
          isDefault: isDefaultFilter,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.filter) {
        setSavedFilters((prev) => [json.filter, ...prev]);
        setNewFilterName("");
        setIsSavingFilter(false);
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteSavedFilter = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/user-preferences/filters/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSavedFilters((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      // ignore
    }
  };

  const handleSelectSavedFilter = (item: SavedFilterItem) => {
    onFilterChange(item.filters);
    setIsMenuOpen(false);
  };

  const handleApplyCustomFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFilterField || !customFilterValue.trim()) return;
    const next = { ...filters, [customFilterField]: customFilterValue.trim() };
    onFilterChange(next);
    setCustomFilterValue("");
  };

  const handleViewSwitch = async (view: ViewType) => {
    if (!onViewChange) return;
    onViewChange(view);
    try {
      await fetch("/api/user-preferences/views", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey, viewType: view }),
      });
    } catch {
      // ignore
    }
  };

  const activeChips = Object.entries(filters).filter(
    ([k, v]) => v && v !== "ALL" && k !== "page" && k !== "pageSize" && k !== "q",
  );

  return (
    <div className={cn("relative flex items-center justify-between gap-3", className)}>
      {/* Odoo Unified Search & Filter Container */}
      <div
        ref={menuContainerRef}
        className="relative flex flex-1 items-center rounded-xl border border-slate-300 bg-white shadow-sm transition focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800/10"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5 px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />

          {/* Active Filter Chips embedded directly in search bar (Odoo Style) */}
          {activeChips.map(([key, val]) => {
            const facet = facets.find((f) => f.field === key);
            const isGroup = key === "groupBy";
            const label = isGroup
              ? `Agrupar: ${val}`
              : facet
                ? `${facet.label}: ${formatFacetValue(facet, val)}`
                : `${key}: ${val}`;

            return (
              <span
                key={key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold shadow-xs animate-in fade-in zoom-in-95",
                  isGroup
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                    : "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200",
                )}
              >
                {isGroup ? <Layers className="h-3 w-3" /> : <Filter className="h-3 w-3" />}
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveChip(key)}
                  className="rounded-sm p-0.5 hover:bg-black/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}

          {/* Inline Search Input */}
          <input
            ref={inputRef}
            type="text"
            value={searchVal}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={activeChips.length > 0 ? "Agregar criterio..." : searchPlaceholder}
            className="min-w-[140px] flex-1 bg-transparent py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        {/* Action icons on right of search input */}
        <div className="flex items-center border-l border-slate-200">
          {searchVal || activeChips.length > 0 ? (
            <button
              type="button"
              onClick={handleClearAll}
              className="p-2 text-slate-400 hover:text-slate-600"
              title="Limpiar filtros y búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}

          {/* Odoo Dropdown Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn(
              "flex items-center gap-1.5 rounded-r-xl px-3 py-2 text-xs font-semibold transition",
              isMenuOpen
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-slate-700 hover:bg-slate-100",
            )}
            title="Abrir menú de filtros, agrupaciones y favoritos"
          >
            <Filter className="h-3.5 w-3.5" />
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isMenuOpen && "rotate-180")} />
          </button>
        </div>

        {/* Odoo 3-Column Floating Popover Menu */}
        {isMenuOpen ? (
          <div className="absolute left-0 top-full z-50 mt-2 flex w-full min-w-[700px] max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
            {/* Column 1: Filtros */}
            <div className="flex-1 border-r border-slate-100 pr-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
                <Filter className="h-3.5 w-3.5 text-indigo-600" />
                Filtros
              </div>

              <div className="space-y-1 text-xs">
                {facets.map((facet) => {
                  const currentVal = filters[facet.field];
                  const options =
                    facet.options ??
                    (facetOptions[facet.field] || []).map((val) => ({
                      label: val,
                      value: val,
                    }));
                  const isExpanded = activeFacetSubmenu === facet.field;

                  return (
                    <div key={facet.field} className="rounded-lg">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveFacetSubmenu(isExpanded ? null : facet.field)
                        }
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-medium transition hover:bg-slate-100",
                          currentVal ? "bg-indigo-50/70 text-indigo-900" : "text-slate-700",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-3.5 w-3.5 items-center justify-center rounded border",
                              currentVal
                                ? "border-indigo-600 bg-indigo-600 text-white"
                                : "border-slate-300",
                            )}
                          >
                            {currentVal ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
                          </div>
                          <span>
                            {facet.label} {currentVal ? `: ${formatFacetValue(facet, currentVal)}` : ""}
                          </span>
                        </div>
                        <ChevronRight
                          className={cn("h-3 w-3 text-slate-400 transition-transform", isExpanded && "rotate-90")}
                        />
                      </button>

                      {/* Expanded values for this facet */}
                      {isExpanded ? (
                        <div className="my-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-1.5 pl-6">
                          {options.length === 0 ? (
                            <p className="py-1 text-[11px] text-slate-400">Sin opciones</p>
                          ) : null}
                          {options.map((opt) => {
                            const isSelected = facet.multi
                              ? facetValues(filters[facet.field]).includes(opt.value)
                              : filters[facet.field] === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleFacetToggle(facet.field, opt.value)}
                                className={cn(
                                  "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition",
                                  isSelected
                                    ? "bg-indigo-600 font-semibold text-white"
                                    : "text-slate-600 hover:bg-slate-200/70",
                                )}
                              >
                                <span>{opt.label}</span>
                                {isSelected ? <Check className="h-3 w-3" /> : null}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {/* Agregar filtro personalizado */}
                <div className="pt-2">
                  <div className="flex items-center gap-1.5 py-1 text-[11px] font-semibold text-slate-500">
                    <Plus className="h-3 w-3" /> Agregar filtro personalizado
                  </div>
                  <form onSubmit={handleApplyCustomFilter} className="flex gap-1 pt-1">
                    <select
                      value={customFilterField}
                      onChange={(e) => setCustomFilterField(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                    >
                      <option value="">Campo...</option>
                      {facets.map((f) => (
                        <option key={f.field} value={f.field}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={customFilterValue}
                      onChange={(e) => setCustomFilterValue(e.target.value)}
                      placeholder="Valor..."
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                    >
                      Aplicar
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Column 2: Agrupar por */}
            <div className="flex-1 border-r border-slate-100 px-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
                <Layers className="h-3.5 w-3.5 text-emerald-600" />
                Agrupar por
              </div>

              <div className="space-y-1 text-xs">
                {groupByOptions.length === 0 ? (
                  <p className="text-[11px] text-slate-400">No hay opciones de agrupación</p>
                ) : null}
                {groupByOptions.map((opt) => {
                  const isSelected = filters.groupBy === opt.field;
                  return (
                    <button
                      key={opt.field}
                      type="button"
                      onClick={() => handleGroupByToggle(opt.field)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-medium transition hover:bg-slate-100",
                        isSelected ? "bg-emerald-50 text-emerald-900" : "text-slate-700",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-3.5 w-3.5 items-center justify-center rounded border",
                            isSelected
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-slate-300",
                          )}
                        >
                          {isSelected ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
                        </div>
                        <span>{opt.label}</span>
                      </div>
                    </button>
                  );
                })}

                {/* Custom Group Option if active and not in predefined list */}
                {filters.groupBy && !groupByOptions.some((g) => g.field === filters.groupBy) ? (
                  <button
                    type="button"
                    onClick={() => handleGroupByToggle(filters.groupBy!)}
                    className="flex w-full items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 text-left font-medium text-emerald-900 transition"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-3.5 w-3.5 items-center justify-center rounded border border-emerald-600 bg-emerald-600 text-white">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                      <span className="capitalize">
                        {facets.find((f) => f.field === filters.groupBy)?.label || filters.groupBy}
                      </span>
                    </div>
                  </button>
                ) : null}

                {/* Agregar grupo personalizado */}
                <div className="pt-2">
                  <div className="flex items-center gap-1.5 py-1 text-[11px] font-semibold text-slate-500">
                    <Plus className="h-3 w-3" /> Agregar grupo personalizado
                  </div>
                  <form onSubmit={handleApplyCustomGroup} className="flex gap-1 pt-1">
                    <select
                      value={customGroupField}
                      onChange={(e) => setCustomGroupField(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                    >
                      <option value="">Seleccionar campo...</option>
                      {facets
                        .filter((f) => !groupByOptions.some((g) => g.field === f.field))
                        .map((f) => (
                          <option key={f.field} value={f.field}>
                            {f.label}
                          </option>
                        ))}
                    </select>
                    <button
                      type="submit"
                      disabled={!customGroupField}
                      className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Agrupar
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Column 3: Favoritos */}
            <div className="flex-1 pl-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                Favoritos
              </div>

              <div className="space-y-1.5 text-xs">
                {savedFilters.length === 0 ? (
                  <p className="text-[11px] text-slate-400">No hay búsquedas guardadas</p>
                ) : null}
                {savedFilters.map((sf) => (
                  <div
                    key={sf.id}
                    onClick={() => handleSelectSavedFilter(sf)}
                    className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 transition hover:bg-amber-50/70"
                  >
                    <span className="truncate font-medium text-slate-800">
                      {sf.name} {sf.isDefault ? "(Predeterminado)" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSavedFilter(sf.id, e)}
                      className="rounded p-1 text-slate-400 hover:text-rose-600"
                      title="Eliminar favorito"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {/* Guardar búsqueda actual */}
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {!isSavingFilter ? (
                    <button
                      type="button"
                      onClick={() => setIsSavingFilter(true)}
                      className="flex w-full items-center gap-1.5 rounded-lg py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      Guardar búsqueda actual
                    </button>
                  ) : (
                    <form onSubmit={handleSaveCurrentFilter} className="space-y-2 rounded-xl bg-slate-50 p-2.5 border border-slate-200">
                      <span className="block text-[11px] font-semibold text-slate-700">
                        Nombre de la búsqueda:
                      </span>
                      <input
                        type="text"
                        value={newFilterName}
                        onChange={(e) => setNewFilterName(e.target.value)}
                        placeholder="Ej: Pendientes Santiago"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        autoFocus
                      />
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          checked={isDefaultFilter}
                          onChange={(e) => setIsDefaultFilter(e.target.checked)}
                        />
                        Usar por defecto
                      </label>
                      <div className="flex justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsSavingFilter(false)}
                          className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-200"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="rounded-md bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          Guardar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* View Switcher Toggle (Table vs Cards vs Kanban) */}
      {allowedViews && allowedViews.length > 1 && currentView && onViewChange ? (
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-slate-600">
          {allowedViews.includes("list") ? (
            <button
              type="button"
              onClick={() => handleViewSwitch("list")}
              className={cn(
                "rounded-lg p-1.5 transition",
                currentView === "list"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "hover:text-slate-900",
              )}
              title="Vista de Tabla"
            >
              <List className="h-4 w-4" />
            </button>
          ) : null}
          {allowedViews.includes("cards") ? (
            <button
              type="button"
              onClick={() => handleViewSwitch("cards")}
              className={cn(
                "rounded-lg p-1.5 transition",
                currentView === "cards"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "hover:text-slate-900",
              )}
              title="Vista de Tarjetas"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          ) : null}
          {allowedViews.includes("kanban") ? (
            <button
              type="button"
              onClick={() => handleViewSwitch("kanban")}
              className={cn(
                "rounded-lg p-1.5 transition",
                currentView === "kanban"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "hover:text-slate-900",
              )}
              title="Tablero Kanban"
            >
              <Columns className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
