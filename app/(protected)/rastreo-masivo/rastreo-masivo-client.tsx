"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowStatusBar } from "@/components/ui/workflow-status-bar";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useWorkflowDraft } from "@/lib/use-workflow-draft";

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
  exportColumns: ColumnKey[];
  stats: { totalTokens: number; matches: number } | null;
};

const COLUMNS = [
  { key: "tc", label: "TC" },
  { key: "externalReference", label: "Referencia" },
  { key: "nombre", label: "Nombre" },
  { key: "cedula", label: "Cedula" },
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
  { key: "tipoEmision", label: "Tipo emision" },
  { key: "telefonos", label: "Telefonos" },
  { key: "direccion", label: "Direccion" },
  { key: "motivoRetorno", label: "Motivo retorno" },
  { key: "matchedBy", label: "Coincidencias" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

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

const DEFAULT_EXPORT: ColumnKey[] = [
  "tc",
  "externalReference",
  "nombre",
  "cedula",
  "status",
  "provincia",
  "zona",
  "mensajero",
  "fechaDespacho",
  "slaVence",
  "urgente",
  "remota",
  "tipoTarjeta",
  "adicional",
  "adicionalNumero",
  "tipoEntrega",
  "tipoEmision",
  "telefonos",
  "direccion",
  "motivoRetorno",
  "matchedBy",
];

function dateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-DO");
}

function cellValue(row: Row, key: ColumnKey) {
  if (key === "status") {
    return <StatusBadge value={row.status} />;
  }
  if (key === "urgente") return row.urgente ? "SI" : "NO";
  if (key === "remota") return row.remota ? "SI" : "NO";
  if (key === "adicional") return row.adicional ? "SI" : "NO";
  if (key === "adicionalNumero") return row.adicional ? String(row.adicionalNumero) : "-";
  if (key === "fechaDespacho") return dateLabel(row.fechaDespacho);
  if (key === "slaVence") return dateLabel(row.slaVence);
  if (key === "matchedBy") return row.matchedBy.join(", ") || "-";
  const value = row[key] as string | null;
  return value || "-";
}

export default function RastreoMasivoClient() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [visibleColumns, setVisibleColumns] = usePersistentState<ColumnKey[]>(
    "rastreo-masivo:visible-columns",
    DEFAULT_VISIBLE,
  );
  const [exportColumns, setExportColumns] = usePersistentState<ColumnKey[]>(
    "rastreo-masivo:export-columns",
    DEFAULT_EXPORT,
  );
  const [stats, setStats] = useState<{ totalTokens: number; matches: number } | null>(null);

  const draftPayload = useMemo<TrackingDraft>(
    () => ({ query, rows, visibleColumns, exportColumns, stats }),
    [exportColumns, query, rows, stats, visibleColumns],
  );
  const workflowDraft = useWorkflowDraft<TrackingDraft>({
    module: "rastreo-masivo",
    payload: draftPayload,
    shouldSave: Boolean(query.trim()),
    onRestore: (draft) => {
      setQuery(draft.query);
      setRows(draft.rows);
      setVisibleColumns(draft.visibleColumns);
      setExportColumns(draft.exportColumns);
      setStats(draft.stats);
    },
  });

  const visibleDefs = useMemo(
    () => COLUMNS.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns],
  );

  async function runSearch() {
    if (!query.trim()) {
      setMessage("Pega al menos un nombre, cedula o numero de tarjeta");
      return;
    }
    setLoading(true);
    setMessage("");
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
    setMessage(`Rastreo completado: ${json.matches} coincidencia(s)`);
    setLoading(false);
  }

  function toggleColumn(
    key: ColumnKey,
    target: "visible" | "export",
    checked: boolean,
  ) {
    const setter = target === "visible" ? setVisibleColumns : setExportColumns;
    setter((prev) => {
      if (checked) {
        if (prev.includes(key)) return prev;
        return [...prev, key];
      }
      if (prev.length <= 1) return prev;
      return prev.filter((item) => item !== key);
    });
  }

  async function exportRows(format: "csv" | "xlsx" | "pdf") {
    if (!query.trim()) {
      setMessage("Escribe los datos en el textarea para exportar");
      return;
    }
    if (!exportColumns.length) {
      setMessage("Selecciona al menos una columna para exportar");
      return;
    }

    const res = await fetch("/api/rastreo-masivo/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        columns: exportColumns,
        format,
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar rastreo masivo" }));
      setMessage(json.error ?? "No se pudo exportar rastreo masivo");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rastreo-masivo.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Export generado en ${format.toUpperCase()}`);
  }

  return (
    <div>
      <PageHeader
        title="Rastreo masivo"
        subtitle="Busca por nombres, cedulas o tarjetas y controla columnas visibles/exportables"
      />
      <WorkflowStatusBar
        status={workflowDraft.status}
        updatedAt={workflowDraft.updatedAt}
        onUseRemote={workflowDraft.useRemoteVersion}
        onOverwrite={workflowDraft.overwriteRemote}
      />

      <Panel>
        <label className="mb-2 block text-sm font-semibold text-slate-800">
          Datos a rastrear (uno por linea, o separados por coma)
        </label>
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          rows={8}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          placeholder={"Ej:\nMARIA PEREZ\n001-1234567-8\n4242424242424242"}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Buscando..." : "Rastrear"}
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setRows([]);
              setStats(null);
              setMessage("");
            }}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            Limpiar
          </button>
          <button type="button" onClick={() => void exportRows("csv")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
            Exportar CSV
          </button>
          <button type="button" onClick={() => void exportRows("xlsx")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
            Exportar Excel
          </button>
          <button type="button" onClick={() => void exportRows("pdf")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
            Exportar PDF
          </button>
        </div>

        {stats ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Entradas: {stats.totalTokens} · Coincidencias: {stats.matches}
          </div>
        ) : null}

        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel className="mt-5" title="Columnas">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.key} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <p className="font-semibold text-slate-800">{column.label}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-slate-600">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(column.key)}
                    onChange={(event) => toggleColumn(column.key, "visible", event.target.checked)}
                  />
                  Ver
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={exportColumns.includes(column.key)}
                    onChange={(event) => toggleColumn(column.key, "export", event.target.checked)}
                  />
                  Exportar
                </label>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="mt-5" title={`Resultados${rows.length ? ` (${rows.length})` : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {visibleDefs.map((column) => (
                  <th key={column.key} className="pb-2">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  {visibleDefs.map((column) => (
                    <td key={`${row.id}-${column.key}`} className="py-2 pr-3">
                      {cellValue(row, column.key)}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={Math.max(1, visibleDefs.length)} className="py-6 text-center text-sm text-slate-500">
                    Sin resultados todavia.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
