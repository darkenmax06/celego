"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import {
  CARD_EXPORT_FIELDS,
  DEFAULT_CARD_EXPORT_FIELDS,
  MAX_CARD_EXPORT_SELECTION,
  type CardExportFieldKey,
} from "@/lib/card-selection-export";
import { cn } from "@/lib/utils";

type ExportFormat = "xlsx" | "csv";

type Props = {
  cardIds: string[];
  onClose: () => void;
  onExported?: (message: string) => void;
};

const STEPS = ["Campos", "Formato"] as const;

/** Two-step wizard: pick the fields, then the file format, then download. */
export function CardExportWizardModal({ cardIds, onClose, onExported }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<CardExportFieldKey[]>(DEFAULT_CARD_EXPORT_FIELDS);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooMany = cardIds.length > MAX_CARD_EXPORT_SELECTION;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exporting, onClose]);

  function toggleField(key: CardExportFieldKey) {
    setFields((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  async function download() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/tarjetas/exportar-seleccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds, fields, format }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "No se pudo generar el archivo");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tarjetas-seleccion-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      onExported?.(`Archivo ${format.toUpperCase()} generado con ${cardIds.length} tarjeta(s).`);
      onClose();
    } catch {
      setError("Ocurrió un error inesperado al generar el archivo");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !exporting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 bg-gradient-to-r from-[#0f2544] to-slate-800 px-5 py-3 text-white">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-white/80">
              Exportar selección · Paso {step + 1} de {STEPS.length}
            </span>
            <h2 id={titleId} className="font-display text-base font-bold leading-tight">
              {step === 0 ? "Elige los campos" : "Elige el formato"} ({cardIds.length} tarjetas)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {tooMany ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              Solo se pueden exportar hasta {MAX_CARD_EXPORT_SELECTION} tarjetas a la vez. Reduce la selección.
            </p>
          ) : null}

          {step === 0 ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{fields.length} campo(s) seleccionados</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFields(CARD_EXPORT_FIELDS.map((field) => field.key))}
                    className="font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Seleccionar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFields([])}
                    className="font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Ninguno
                  </button>
                </div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {CARD_EXPORT_FIELDS.map((field) => {
                  const checked = fields.includes(field.key);
                  return (
                    <label
                      key={field.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition",
                        checked
                          ? "border-indigo-200 bg-indigo-50/60 font-semibold text-indigo-900"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleField(field.key)}
                        className="h-3.5 w-3.5"
                      />
                      {field.label}
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { value: "xlsx", label: "Excel (.xlsx)", hint: "Ideal para filtrar y compartir", icon: FileSpreadsheet },
                  { value: "csv", label: "CSV (.csv)", hint: "Texto plano separado por comas", icon: FileText },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const selected = format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormat(option.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-4 text-left transition",
                      selected ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300" : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <Icon className={cn("h-6 w-6 shrink-0", selected ? "text-indigo-600" : "text-slate-400")} />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                      <span className="block text-xs text-slate-500">{option.hint}</span>
                    </span>
                    {selected ? <Check className="h-4 w-4 text-indigo-600" /> : null}
                  </button>
                );
              })}
              <p className="text-xs text-slate-500 sm:col-span-2">
                Campos: {CARD_EXPORT_FIELDS.filter((field) => fields.includes(field.key)).map((field) => field.label).join(", ")}
              </p>
            </div>
          )}

          {error ? <p className="text-xs font-semibold text-rose-700">{error}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
          {step === 0 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!fields.length || tooMany}
                onClick={() => setStep(1)}
                className="rounded-lg bg-[#0f2544] px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#1a3860] disabled:opacity-50"
              >
                Siguiente
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(0)}
                disabled={exporting}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Atrás
              </button>
              <button
                type="button"
                disabled={exporting || !fields.length || tooMany}
                onClick={() => void download()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f2544] px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#1a3860] disabled:opacity-50"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? "Generando..." : "Descargar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
