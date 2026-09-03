"use client";

import { useEffect, useState } from "react";
import {
  X,
  FileSpreadsheet,
  FileText,
  Download,
  BookmarkPlus,
  Trash2,
  Check,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const EXPORT_AVAILABLE_COLUMNS = [
  { key: "tc", label: "TC" },
  { key: "externalReference", label: "Referencia" },
  { key: "nombre", label: "Nombre / Cliente" },
  { key: "cedula", label: "Cédula" },
  { key: "status", label: "Estado / Status" },
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
  { key: "matchedBy", label: "Coincidencias de búsqueda" },
] as const;

export type ExportColumnKey = (typeof EXPORT_AVAILABLE_COLUMNS)[number]["key"];

export const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
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
  "tipoEntrega",
  "telefonos",
  "direccion",
  "matchedBy",
];

const BUILT_IN_PRESETS: Array<{
  id: string;
  name: string;
  columns: ExportColumnKey[];
}> = [
  {
    id: "system-default",
    name: "Completo estándar",
    columns: DEFAULT_EXPORT_COLUMNS,
  },
  {
    id: "system-all",
    name: "Todas las columnas (21)",
    columns: EXPORT_AVAILABLE_COLUMNS.map((c) => c.key),
  },
  {
    id: "system-basic",
    name: "Resumen básico (TC, Cliente, Cédula, Estado, Provincia)",
    columns: ["tc", "nombre", "cedula", "status", "provincia", "mensajero"],
  },
  {
    id: "system-operativo",
    name: "Operativo y Rutas",
    columns: [
      "tc",
      "nombre",
      "status",
      "mensajero",
      "provincia",
      "zona",
      "direccion",
      "telefonos",
      "fechaDespacho",
      "slaVence",
    ],
  },
];

type UserSavedExportPreset = {
  id: string;
  name: string;
  filters: { columns?: ExportColumnKey[] };
  isDefault: boolean;
};

export type TrackingExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  totalMatches: number;
  initialFormat?: "csv" | "xlsx" | "pdf";
  onSuccessMessage?: (msg: string) => void;
};

export function TrackingExportModal({
  isOpen,
  onClose,
  query,
  totalMatches,
  initialFormat = "xlsx",
  onSuccessMessage,
}: TrackingExportModalProps) {
  const [format, setFormat] = useState<"csv" | "xlsx" | "pdf">(initialFormat);
  const [selectedColumns, setSelectedColumns] = useState<ExportColumnKey[]>(DEFAULT_EXPORT_COLUMNS);
  const [userPresets, setUserPresets] = useState<UserSavedExportPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("system-default");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync format if initialFormat changes when opening
  useEffect(() => {
    if (isOpen) {
      setFormat(initialFormat);
      setErrorMsg(null);
    }
  }, [isOpen, initialFormat]);

  // Load user saved presets from server
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function loadPresets() {
      try {
        const res = await fetch("/api/user-preferences/filters?sectionKey=rastreo-masivo-export");
        if (!res.ok) return;
        const json = await res.json();
        if (isMounted && Array.isArray(json.filters)) {
          setUserPresets(json.filters);
          const defaultPreset = json.filters.find((f: UserSavedExportPreset) => f.isDefault);
          if (defaultPreset && defaultPreset.filters?.columns?.length) {
            setSelectedPresetId(defaultPreset.id);
            setSelectedColumns(defaultPreset.filters.columns);
          }
        }
      } catch {
        // ignore
      }
    }
    void loadPresets();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleColumn = (key: ExportColumnKey) => {
    setSelectedPresetId("custom");
    if (selectedColumns.includes(key)) {
      if (selectedColumns.length <= 1) return; // Keep at least 1 column
      setSelectedColumns(selectedColumns.filter((c) => c !== key));
    } else {
      setSelectedColumns([...selectedColumns, key]);
    }
  };

  const handleSelectAll = () => {
    setSelectedPresetId("system-all");
    setSelectedColumns(EXPORT_AVAILABLE_COLUMNS.map((c) => c.key));
  };

  const handleDeselectAll = () => {
    setSelectedPresetId("custom");
    // Leave at least the primary TC column
    setSelectedColumns(["tc"]);
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const builtIn = BUILT_IN_PRESETS.find((p) => p.id === presetId);
    if (builtIn) {
      setSelectedColumns(builtIn.columns);
      return;
    }
    const userP = userPresets.find((p) => p.id === presetId);
    if (userP && userP.filters?.columns?.length) {
      setSelectedColumns(userP.filters.columns);
    }
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    try {
      const res = await fetch("/api/user-preferences/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey: "rastreo-masivo-export",
          name: newPresetName.trim(),
          filters: { columns: selectedColumns },
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorMsg(json.error || "No se pudo guardar el preset");
        return;
      }

      const json = await res.json();
      if (json.filter) {
        setUserPresets((prev) => [json.filter, ...prev]);
        setSelectedPresetId(json.filter.id);
        setNewPresetName("");
        setIsSavingPreset(false);
      }
    } catch {
      setErrorMsg("Error al conectar con el servidor para guardar preset");
    }
  };

  const handleDeletePreset = async (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/user-preferences/filters/${presetId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setUserPresets((prev) => prev.filter((p) => p.id !== presetId));
        if (selectedPresetId === presetId) {
          setSelectedPresetId("system-default");
          setSelectedColumns(DEFAULT_EXPORT_COLUMNS);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleExport = async () => {
    if (!query.trim()) {
      setErrorMsg("No hay criterios de búsqueda para exportar");
      return;
    }
    if (!selectedColumns.length) {
      setErrorMsg("Selecciona al menos una columna para exportar");
      return;
    }

    setIsExporting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/rastreo-masivo/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          columns: selectedColumns,
          format,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Error en la exportación" }));
        setErrorMsg(json.error ?? "No se pudo exportar el archivo");
        setIsExporting(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `rastreo-masivo-${today}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (onSuccessMessage) {
        onSuccessMessage(`Archivo ${format.toUpperCase()} generado correctamente con ${selectedColumns.length} columna(s).`);
      }
      setIsExporting(false);
      onClose();
    } catch {
      setErrorMsg("Ocurrió un error inesperado al generar el archivo");
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 animate-in zoom-in-95 duration-150 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">
              Exportar resultados de rastreo
            </h3>
            <p className="text-xs text-slate-500">
              Personaliza el formato, campos y presets para el archivo descargable
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {/* Format selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              1. Formato de descarga
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormat("xlsx")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition",
                  format === "xlsx"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600/20"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat("csv")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition",
                  format === "csv"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-600/20"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <FileText className="h-4 w-4 text-indigo-600" />
                <span>CSV (.csv)</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat("pdf")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition",
                  format === "pdf"
                    ? "border-rose-600 bg-rose-50 text-rose-900 ring-2 ring-rose-600/20"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <FileText className="h-4 w-4 text-rose-600" />
                <span>PDF (.pdf)</span>
              </button>
            </div>
          </div>

          {/* Presets Bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                <span>Presets de columnas</span>
              </div>
              {!isSavingPreset ? (
                <button
                  type="button"
                  onClick={() => setIsSavingPreset(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Guardar selección actual
                </button>
              ) : null}
            </div>

            {/* Built-in and User presets chips */}
            <div className="flex flex-wrap gap-1.5">
              {BUILT_IN_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    selectedPresetId === p.id
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100",
                  )}
                >
                  {p.name}
                </button>
              ))}

              {userPresets.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelectPreset(p.id)}
                  className={cn(
                    "group inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    selectedPresetId === p.id
                      ? "bg-amber-600 text-white shadow-xs"
                      : "border border-amber-200 bg-amber-50/80 text-amber-900 hover:border-amber-300 hover:bg-amber-100",
                  )}
                >
                  <span>{p.name}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeletePreset(p.id, e)}
                    className="rounded p-0.5 opacity-60 hover:opacity-100 hover:text-rose-200"
                    title="Eliminar preset"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Save new preset form */}
            {isSavingPreset ? (
              <form onSubmit={handleSavePreset} className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Nombre para este preset (ej. Export Mensajería)..."
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setIsSavingPreset(false)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newPresetName.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Guardar
                </button>
              </form>
            ) : null}
          </div>

          {/* Columns checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                2. Campos a incluir ({selectedColumns.length} de {EXPORT_AVAILABLE_COLUMNS.length})
              </label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Seleccionar todas
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="font-medium text-slate-500 hover:text-slate-800"
                >
                  Deseleccionar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 rounded-xl border border-slate-200 p-3 max-h-56 overflow-y-auto">
              {EXPORT_AVAILABLE_COLUMNS.map((column) => {
                const isChecked = selectedColumns.includes(column.key);
                return (
                  <label
                    key={column.key}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleColumn(column.key);
                    }}
                    className={cn(
                      "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition",
                      isChecked
                        ? "bg-slate-100 font-semibold text-slate-900"
                        : "text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                        isChecked
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300 bg-white",
                      )}
                    >
                      {isChecked ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                    </div>
                    <span className="truncate">{column.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {errorMsg ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {errorMsg}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <span className="text-xs text-slate-500">
            {totalMatches > 0 ? `${totalMatches} registro(s) encontrado(s)` : "Preparado para exportar"}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting || selectedColumns.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Generando {format.toUpperCase()}...</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Descargar {format.toUpperCase()}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
