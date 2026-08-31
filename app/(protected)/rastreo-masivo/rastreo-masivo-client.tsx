"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  SlidersHorizontal,
  Tag,
  User,
  MapPin,
  Calendar,
  AlertTriangle,
  Clock,
  Eye,
} from "lucide-react";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { FilterBar, ViewType } from "@/components/filters/filter-bar";
import { TrackingExportModal } from "@/components/rastreo-masivo/tracking-export-modal";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableColumnSelector } from "@/components/ui/table-column-selector";
import { useResizableColumns, ResizableHeader } from "@/components/ui/use-resizable-columns";
import { WorkflowStatusBar } from "@/components/ui/workflow-status-bar";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useWorkflowDraft } from "@/lib/use-workflow-draft";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  tc: string;
  externalReference: string;
  nombre: string;
  cedula: string;
  status: string;
  provincia: string;
  zona: string;
  mensajero: string;
  fechaDespacho: string | null;
  slaVence: string | null;
  urgente: boolean;
  remota: boolean;
  tipoTarjeta: string;
  adicional: boolean;
  adicionalNumero: number;
  tipoEntrega: string;
  tipoEmision: string;
  telefonos: string;
  direccion: string;
  motivoRetorno: string;
  matchedBy: string[];
};

type SearchResponse = {
  totalTokens: number;
  matches: number;
  rows: Row[];
};

type TrackingDraft = {
  query: string;
  rows: Row[];
  visibleColumns: ColumnKey[];
  stats: { totalTokens: number; matches: number } | null;
};

export const COLUMNS = [
  { key: "tc", label: "TC", locked: true },
  { key: "externalReference", label: "Referencia" },
  { key: "nombre", label: "Nombre" },
  { key: "cedula", label: "Cédula" },
  { key: "status", label: "Status" },
  { key: "provincia", label: "Provincia" },
  { key: "zona", label: "Zona" },
  { key: "mensajero", label: "Mensajero" },
  { key: "fechaDespacho", label: "Fecha despacho" },
  { key: "slaVence", label: "SLA vence" },
  { key: "urgente", label: "Urgente" },
  { key: "remota", label: "Remota" },
  { key: "tipoTarjeta", label: "Tipo tarjeta" },
  { key: "adicional", label: "Adicional" },
  { key: "adicionalNumero", label: "No adicional" },
  { key: "tipoEntrega", label: "Tipo entrega" },
  { key: "tipoEmision", label: "Tipo emisión" },
  { key: "telefonos", label: "Teléfonos" },
  { key: "direccion", label: "Dirección" },
  { key: "motivoRetorno", label: "Motivo retorno" },
  { key: "matchedBy", label: "Coincidencias" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];

const DEFAULT_VISIBLE: ColumnKey[] = [
  "tc",
  "nombre",
  "cedula",
  "status",
  "provincia",
  "zona",
  "mensajero",
  "fechaDespacho",
  "slaVence",
  "urgente",
];

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  tc: 140,
  externalReference: 130,
  nombre: 220,
  cedula: 130,
  status: 130,
  provincia: 140,
  zona: 130,
  mensajero: 160,
  fechaDespacho: 130,
  slaVence: 130,
  urgente: 90,
  remota: 90,
  tipoTarjeta: 120,
  adicional: 100,
  adicionalNumero: 100,
  tipoEntrega: 130,
  tipoEmision: 130,
  telefonos: 150,
  direccion: 240,
  motivoRetorno: 160,
  matchedBy: 160,
  acciones: 100,
};

function dateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-DO");
}

function getTrackingGroupKey(row: Row, groupBy: string): { key: string; label: string } {
  switch (groupBy) {
    case "status":
      return { key: row.status || "SIN_ESTADO", label: row.status || "Sin Estado" };
    case "provincia":
      return { key: row.provincia || "SIN_PROVINCIA", label: row.provincia || "Sin Provincia" };
    case "zona":
      return { key: row.zona || "SIN_ZONA", label: row.zona || "Sin Zona" };
    case "mensajero":
      return { key: row.mensajero || "SIN_ASIGNAR", label: row.mensajero || "Sin Mensajero" };
    case "urgente":
      return row.urgente ? { key: "URGENTE", label: "Urgentes" } : { key: "NORMAL", label: "No Urgentes" };
    case "remota":
      return row.remota ? { key: "REMOTA", label: "Remotas" } : { key: "LOCAL", label: "Locales (No remotas)" };
    case "tipoTarjeta":
      return { key: row.tipoTarjeta || "PRINCIPAL", label: row.tipoTarjeta || "Principal" };
    default: {
      const val = (row as unknown as Record<string, unknown>)[groupBy];
      if (val !== undefined && val !== null) {
        return { key: String(val), label: String(val) };
      }
      return { key: "ALL", label: "General" };
    }
  }
}

export default function RastreoMasivoClient() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<{ totalTokens: number; matches: number } | null>(null);

  // View state & column customization
  const [viewMode, setViewMode] = useState<ViewType>("list");
  const [visibleColumns, setVisibleColumns] = usePersistentState<ColumnKey[]>(
    "rastreo-masivo:visible-columns",
    DEFAULT_VISIBLE,
  );
  const { widths: columnWidths, updateWidth: onColumnResize } = useResizableColumns(
    "rastreo-masivo",
    DEFAULT_COLUMN_WIDTHS,
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Filter bar state for results
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Selected card detail modal
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Export Modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx" | "pdf">("xlsx");

  const draftPayload = useMemo<TrackingDraft>(
    () => ({ query, rows, visibleColumns, stats }),
    [query, rows, stats, visibleColumns],
  );

  const workflowDraft = useWorkflowDraft<TrackingDraft>({
    module: "rastreo-masivo",
    payload: draftPayload,
    shouldSave: Boolean(query.trim()),
    onRestore: (draft) => {
      setQuery(draft.query);
      setRows(draft.rows);
      setVisibleColumns(draft.visibleColumns);
      setStats(draft.stats);
    },
  });

  const visibleDefs = useMemo(
    () => COLUMNS.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns],
  );

  async function runSearch() {
    if (!query.trim()) {
      setMessage("Pega al menos un nombre, cédula o número de tarjeta");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/rastreo-masivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = (await res.json().catch(() => ({ error: "No se pudo rastrear" }))) as
        | SearchResponse
        | { error: string };
      if (!res.ok || "error" in json) {
        setMessage(("error" in json && json.error) || "No se pudo rastrear");
        setLoading(false);
        return;
      }

      setRows(json.rows ?? []);
      setStats({ totalTokens: json.totalTokens, matches: json.matches });
      setMessage(`Rastreo completado: ${json.matches} coincidencia(s) de ${json.totalTokens} entradas`);
      setLoading(false);
    } catch {
      setMessage("Error de conexión al realizar el rastreo masivo");
      setLoading(false);
    }
  }

  // Filter rows based on in-memory facets & search in FilterBar
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Free text search in results
      if (filters.q) {
        const qLower = filters.q.toLowerCase();
        const matchesQ =
          row.tc.toLowerCase().includes(qLower) ||
          row.nombre.toLowerCase().includes(qLower) ||
          row.cedula.toLowerCase().includes(qLower) ||
          row.provincia.toLowerCase().includes(qLower) ||
          row.zona.toLowerCase().includes(qLower) ||
          row.mensajero.toLowerCase().includes(qLower) ||
          row.status.toLowerCase().includes(qLower);
        if (!matchesQ) return false;
      }

      // Status facet
      if (filters.status && filters.status !== "ALL" && row.status !== filters.status) {
        return false;
      }
      // Provincia facet
      if (filters.provincia && filters.provincia !== "ALL" && row.provincia !== filters.provincia) {
        return false;
      }
      // Zona facet
      if (filters.zona && filters.zona !== "ALL" && row.zona !== filters.zona) {
        return false;
      }
      // Mensajero facet
      if (filters.mensajero && filters.mensajero !== "ALL" && row.mensajero !== filters.mensajero) {
        return false;
      }
      // Urgente facet
      if (filters.urgente && filters.urgente !== "ALL") {
        if (filters.urgente === "SI" && !row.urgente) return false;
        if (filters.urgente === "NO" && row.urgente) return false;
      }
      // Remota facet
      if (filters.remota && filters.remota !== "ALL") {
        if (filters.remota === "SI" && !row.remota) return false;
        if (filters.remota === "NO" && row.remota) return false;
      }
      // Tipo tarjeta facet
      if (filters.tipoTarjeta && filters.tipoTarjeta !== "ALL" && row.tipoTarjeta !== filters.tipoTarjeta) {
        return false;
      }

      return true;
    });
  }, [rows, filters]);

  // Group filtered rows if groupBy is active
  const groupedRows = useMemo(() => {
    if (!filters.groupBy) return null;
    const groups: Record<string, { groupKey: string; groupLabel: string; items: Row[] }> = {};
    for (const row of filteredRows) {
      const { key, label } = getTrackingGroupKey(row, filters.groupBy);
      if (!groups[key]) {
        groups[key] = { groupKey: key, groupLabel: label, items: [] };
      }
      groups[key].items.push(row);
    }
    return Object.values(groups);
  }, [filteredRows, filters.groupBy]);

  // Distinct facet values computed from actual rows
  const dynamicFacets = useMemo(() => {
    const statuses = Array.from(new Set(rows.map((r) => r.status).filter(Boolean))).sort();
    const provincias = Array.from(new Set(rows.map((r) => r.provincia).filter(Boolean))).sort();
    const zonas = Array.from(new Set(rows.map((r) => r.zona).filter(Boolean))).sort();
    const mensajeros = Array.from(new Set(rows.map((r) => r.mensajero).filter(Boolean))).sort();

    return [
      {
        field: "status",
        label: "Estado",
        options: statuses.map((s) => ({ label: s, value: s })),
      },
      {
        field: "provincia",
        label: "Provincia",
        options: provincias.map((p) => ({ label: p, value: p })),
      },
      {
        field: "zona",
        label: "Zona",
        options: zonas.map((z) => ({ label: z, value: z })),
      },
      {
        field: "mensajero",
        label: "Mensajero",
        options: mensajeros.map((m) => ({ label: m, value: m })),
      },
      {
        field: "urgente",
        label: "Urgente",
        options: [
          { label: "Solo Urgentes", value: "SI" },
          { label: "No Urgentes", value: "NO" },
        ],
      },
      {
        field: "remota",
        label: "Remota",
        options: [
          { label: "Solo Remotas", value: "SI" },
          { label: "Locales (No remotas)", value: "NO" },
        ],
      },
      {
        field: "tipoTarjeta",
        label: "Tipo tarjeta",
        options: [
          { label: "Principal", value: "PRINCIPAL" },
          { label: "Adicional", value: "ADICIONAL" },
        ],
      },
    ];
  }, [rows]);

  function openExportModal(fmt: "csv" | "xlsx" | "pdf") {
    if (!query.trim()) {
      setMessage("Escribe o pega referencias en el recuadro para poder exportar");
      return;
    }
    setExportFormat(fmt);
    setExportModalOpen(true);
  }

  function cellValue(row: Row, key: ColumnKey) {
    if (key === "tc") {
      return (
        <span
          onClick={() => setSelectedCardId(row.id)}
          className="cursor-pointer font-mono font-bold text-blue-700 hover:underline truncate block"
          title={row.tc}
        >
          {row.tc}
        </span>
      );
    }
    if (key === "nombre") {
      return (
        <span
          onClick={() => setSelectedCardId(row.id)}
          className="cursor-pointer font-medium text-slate-900 hover:underline truncate block"
          title={row.nombre}
        >
          {row.nombre}
        </span>
      );
    }
    if (key === "status") {
      return <StatusBadge value={row.status} />;
    }
    if (key === "urgente") {
      return row.urgente ? (
        <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
          SÍ
        </span>
      ) : (
        <span className="text-slate-500">NO</span>
      );
    }
    if (key === "remota") return row.remota ? "SÍ" : "NO";
    if (key === "adicional") return row.adicional ? "SÍ" : "NO";
    if (key === "adicionalNumero") return row.adicional ? String(row.adicionalNumero) : "-";
    if (key === "fechaDespacho") return dateLabel(row.fechaDespacho);
    if (key === "slaVence") return dateLabel(row.slaVence);
    if (key === "matchedBy") {
      return (
        <span className="text-xs text-indigo-700 font-medium truncate block" title={row.matchedBy.join(", ")}>
          {row.matchedBy.join(", ") || "-"}
        </span>
      );
    }
    const value = row[key] as string | null;
    return (
      <span className="truncate block" title={value || ""}>
        {value || "-"}
      </span>
    );
  }

  const renderTableRow = (row: Row) => (
    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors">
      {visibleColumns.map((colKey) => (
        <td key={`${row.id}-${colKey}`} className="px-3 py-2.5 truncate text-sm text-slate-700">
          {cellValue(row, colKey)}
        </td>
      ))}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => setSelectedCardId(row.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <Eye className="h-3 w-3" />
          Ver
        </button>
      </td>
    </tr>
  );

  const renderCardItem = (row: Row) => (
    <div
      key={row.id}
      className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-md"
    >
      <div>
        {/* Top Header of Card */}
        <div className="flex items-start justify-between gap-2">
          <span
            onClick={() => setSelectedCardId(row.id)}
            className="cursor-pointer font-mono text-sm font-bold text-blue-700 hover:underline"
            title="Ver detalle"
          >
            {row.tc}
          </span>
          <StatusBadge value={row.status} />
        </div>

        {/* Client info */}
        <h4
          onClick={() => setSelectedCardId(row.id)}
          className="mt-2 font-semibold text-slate-900 cursor-pointer hover:underline"
        >
          {row.nombre}
        </h4>
        <p className="text-xs text-slate-500">Cédula: {row.cedula}</p>

        {/* Location & Details */}
        <div className="mt-3 space-y-1 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {row.provincia} • {row.zona} {row.remota ? "(Remota)" : ""}
            </span>
          </div>

          {row.mensajero ? (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{row.mensajero}</span>
            </div>
          ) : null}

          {row.slaVence ? (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>SLA: {dateLabel(row.slaVence)}</span>
            </div>
          ) : null}
        </div>

        {/* Matched Token Tag */}
        {row.matchedBy.length > 0 ? (
          <div className="mt-3 flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800">
            <Tag className="h-3 w-3 shrink-0 text-indigo-500" />
            <span className="truncate">Coincidió con: {row.matchedBy.join(", ")}</span>
          </div>
        ) : null}
      </div>

      {/* Footer of Card */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5">
          {row.urgente ? (
            <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
              URGENTE
            </span>
          ) : null}
          <span className="text-xs text-slate-400">
            {row.adicional ? `Adic. ${row.adicionalNumero}` : "Principal"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSelectedCardId(row.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <Eye className="h-3 w-3" />
          Ver
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Rastreo masivo"
        subtitle="Busca por nombres, cédulas o tarjetas, visualiza en tabla o tarjetas y exporta con presets personalizados"
      />
      <WorkflowStatusBar
        status={workflowDraft.status}
        updatedAt={workflowDraft.updatedAt}
        onUseRemote={workflowDraft.useRemoteVersion}
        onOverwrite={workflowDraft.overwriteRemote}
      />

      {/* Input panel for mass tracking query */}
      <Panel>
        <label className="mb-2 block text-sm font-semibold text-slate-800">
          Datos a rastrear (uno por línea o separados por coma)
        </label>
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          rows={6}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
          placeholder={"Ej:\nMARIA PEREZ\n001-1234567-8\n4242424242424242"}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-60 transition"
            >
              <Search className="h-4 w-4" />
              {loading ? "Buscando..." : "Rastrear"}
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setRows([]);
                setStats(null);
                setMessage("");
                setFilters({});
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Limpiar
            </button>
          </div>

          {/* Export buttons opening Export Modal */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openExportModal("xlsx")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => openExportModal("csv")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50/80 px-3.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 transition"
            >
              <FileText className="h-3.5 w-3.5 text-indigo-600" />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => openExportModal("pdf")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50/80 px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 transition"
            >
              <FileText className="h-3.5 w-3.5 text-rose-600" />
              Exportar PDF
            </button>
          </div>
        </div>

        {stats ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">
              Entradas procesadas: {stats.totalTokens}
            </span>
            <span>•</span>
            <span className="font-semibold text-emerald-700">
              Coincidencias encontradas: {stats.matches}
            </span>
          </div>
        ) : null}

        {message ? (
          <p className="mt-3 text-sm font-medium text-emerald-700">{message}</p>
        ) : null}
      </Panel>

      {/* FilterBar for search results (Search, Facets, Grouping, Favorites / Presets & View toggle) */}
      {rows.length > 0 ? (
        <FilterBar
          resource="rastreo-masivo"
          sectionKey="rastreo-masivo"
          filters={filters}
          onFilterChange={setFilters}
          onReset={() => setFilters({})}
          searchPlaceholder="Filtrar por TC, cliente, cédula o mensajero en resultados..."
          allowedViews={["list", "cards"]}
          currentView={viewMode}
          onViewChange={setViewMode}
          facets={dynamicFacets}
          groupByOptions={[
            { field: "status", label: "Estado" },
            { field: "provincia", label: "Provincia" },
            { field: "zona", label: "Zona" },
            { field: "mensajero", label: "Mensajero" },
            { field: "urgente", label: "Urgente" },
            { field: "remota", label: "Remota" },
            { field: "tipoTarjeta", label: "Tipo tarjeta" },
          ]}
        />
      ) : null}

      {/* Results Panel */}
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Resultados {rows.length ? `(${filteredRows.length}${filteredRows.length !== rows.length ? ` de ${rows.length}` : ""})` : ""}
            </h2>
            {filters.groupBy ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Agrupado por: {filters.groupBy}
              </span>
            ) : null}
          </div>

          {/* Table Column Selector when in Table view mode */}
          {viewMode === "list" && rows.length > 0 ? (
            <TableColumnSelector
              columns={COLUMNS}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
            />
          ) : null}
        </div>

        {!rows.length ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Pega referencias, nombres o cédulas en el recuadro superior y pulsa <strong>Rastrear</strong> para ver los resultados.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No hay resultados que coincidan con los filtros activos.
          </div>
        ) : viewMode === "cards" ? (
          /* Cards View Mode */
          groupedRows ? (
            <div className="space-y-6">
              {groupedRows.map((group) => {
                const isCollapsed = Boolean(collapsedGroups[group.groupKey]);
                return (
                  <div key={group.groupKey} className="space-y-3">
                    <div
                      onClick={() =>
                        setCollapsedGroups((prev) => ({
                          ...prev,
                          [group.groupKey]: !prev[group.groupKey],
                        }))
                      }
                      className="flex cursor-pointer select-none items-center justify-between rounded-xl bg-slate-100/90 px-4 py-2.5 transition hover:bg-slate-200/80 border border-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-slate-600" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-600" />
                        )}
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Grupo:
                        </span>
                        <span className="text-sm font-bold text-slate-900">{group.groupLabel}</span>
                        <span className="rounded-full bg-slate-200/90 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {group.items.length} {group.items.length === 1 ? "resultado" : "resultados"}
                        </span>
                      </div>
                    </div>

                    {!isCollapsed ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {group.items.map(renderCardItem)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredRows.map(renderCardItem)}
            </div>
          )
        ) : (
          /* Table View Mode with Resizable Columns and Custom Visible Columns */
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1000px] text-left text-sm table-fixed">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600 border-b border-slate-200">
                <tr>
                  {visibleDefs.map((column) => (
                    <ResizableHeader
                      key={column.key}
                      columnKey={column.key}
                      label={column.label}
                      width={columnWidths[column.key] || 130}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ))}
                  <th className="w-24 px-3 py-3 text-right font-bold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows
                  ? groupedRows.map((group) => {
                      const isCollapsed = Boolean(collapsedGroups[group.groupKey]);
                      return (
                        <React.Fragment key={group.groupKey}>
                          <tr
                            onClick={() =>
                              setCollapsedGroups((prev) => ({
                                ...prev,
                                [group.groupKey]: !prev[group.groupKey],
                              }))
                            }
                            className="cursor-pointer bg-slate-100/90 font-semibold text-slate-800 hover:bg-slate-200/80 transition-colors select-none"
                          >
                            <td colSpan={visibleDefs.length + 1} className="px-4 py-2 text-xs">
                              <div className="flex items-center gap-2">
                                {isCollapsed ? (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                                <span>{group.groupLabel}</span>
                                <span className="rounded-full bg-slate-200 px-2 py-0.2 text-[11px] font-bold text-slate-600">
                                  {group.items.length}
                                </span>
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed ? group.items.map(renderTableRow) : null}
                        </React.Fragment>
                      );
                    })
                  : filteredRows.map(renderTableRow)}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Card Detail Modal */}
      {selectedCardId ? (
        <CardDetailModal
          cardId={selectedCardId}
          onClose={() => setSelectedCardId(null)}
          onUpdated={() => void runSearch()}
        />
      ) : null}

      {/* Customized Export Modal with column presets */}
      <TrackingExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        query={query}
        totalMatches={filteredRows.length || stats?.matches || rows.length}
        initialFormat={exportFormat}
        onSuccessMessage={(msg) => setMessage(msg)}
      />
    </div>
  );
}
