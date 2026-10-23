"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { CONTACT_RESULTADOS, CONTACT_RESULTADO_LABELS } from "@/lib/contact-call-shared";
import { ASIGNADO_ME, buildCardFacets } from "@/lib/filters/card-facets";
import { toDateOnlyInputValue } from "@/lib/date";

/**
 * Calls overhaul: "Reporte de contactos" export (one row per card with its
 * latest matching contact, incl. the final "Mensaje" column) served by
 * `GET /api/llamadas/reporte-contactos`. Optionally also offers the legacy
 * daily operativo ZIP (`/api/operativo/contacto/reportes`), which bundles
 * different per-day files and stays available as a second option.
 */

export type ContactReportFormat = "xlsx" | "csv";

export type ContactReportParams = {
  from: string;
  to: string;
  /** A `ContactResultado` or `ALL`. */
  resultado: string;
  /** `ALL` or a `canalContacto` value. */
  canal: string;
  onlyMine: boolean;
  format: ContactReportFormat;
};

export const CONTACT_REPORT_ENDPOINT = "/api/llamadas/reporte-contactos";

export function buildContactReportUrl(params: ContactReportParams): string {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    format: params.format,
    resultado: params.resultado || "CONTACTADA",
  });
  if (params.canal && params.canal !== "ALL") query.set("canal", params.canal);
  if (params.onlyMine) query.set("asignado", ASIGNADO_ME);
  return `${CONTACT_REPORT_ENDPOINT}?${query.toString()}`;
}

/** Saves a fetched file through a temporary link (no-op where object URLs are unavailable). */
async function saveResponse(res: Response, filename: string) {
  const blob = await res.blob();
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const CANAL_OPTIONS = buildCardFacets(["canalContacto"])[0]?.options ?? [];

type Props = {
  onClose: () => void;
  /** Initial state of "Solo asignadas a mí" (e.g. on Mis gestiones). */
  defaultOnlyMine?: boolean;
  /** When provided, also offers the legacy daily operativo ZIP. */
  onExportDailyZip?: (date: string) => Promise<void>;
};

export function ContactReportModal({ onClose, defaultOnlyMine = false, onExportDailyZip }: Props) {
  const today = useMemo(() => toDateOnlyInputValue(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [resultado, setResultado] = useState("CONTACTADA");
  const [canal, setCanal] = useState("ALL");
  const [onlyMine, setOnlyMine] = useState(defaultOnlyMine);
  const [format, setFormat] = useState<ContactReportFormat>("xlsx");
  const [zipDate, setZipDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const invalidRange = !from || !to || from > to;

  async function handleDownload() {
    if (invalidRange) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(buildContactReportUrl({ from, to, resultado, canal, onlyMine, format }));
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage({ tone: "error", text: json.error ?? "No se pudo generar el reporte" });
        return;
      }
      await saveResponse(res, `reporte-contactos-${from}-${to}.${format}`);
      setMessage({ tone: "ok", text: `Reporte descargado en formato ${format.toUpperCase()}` });
    } catch {
      setMessage({ tone: "error", text: "No se pudo generar el reporte" });
    } finally {
      setBusy(false);
    }
  }

  async function handleDailyZip() {
    if (!onExportDailyZip) return;
    setBusy(true);
    try {
      await onExportDailyZip(zipDate);
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800";

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reporte de contactos"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h3 className="font-display text-lg font-bold text-slate-900">Reporte de contactos</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Desde
              <input type="date" aria-label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Hasta
              <input type="date" aria-label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Resultado
              <select aria-label="Resultado" value={resultado} onChange={(e) => setResultado(e.target.value)} className={fieldClass}>
                {CONTACT_RESULTADOS.map((value) => (
                  <option key={value} value={value}>
                    {value === "CONTACTADA" ? "Contactadas" : CONTACT_RESULTADO_LABELS[value]}
                  </option>
                ))}
                <option value="ALL">Todas</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Canal
              <select aria-label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)} className={fieldClass}>
                <option value="ALL">Todos</option>
                {CANAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Formato
              <select
                aria-label="Formato"
                value={format}
                onChange={(e) => setFormat(e.target.value === "csv" ? "csv" : "xlsx")}
                className={fieldClass}
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="h-4 w-4 accent-[#0f2544]"
              />
              Solo asignadas a mí
            </label>
          </div>

          {invalidRange ? (
            <p className="text-xs font-semibold text-red-600">La fecha inicial debe ser anterior o igual a la final.</p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={busy || invalidRange}
            className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Generando..." : "Descargar reporte"}
          </button>

          {message ? (
            <p
              role="status"
              className={`text-sm font-semibold ${message.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}
            >
              {message.text}
            </p>
          ) : null}

          {onExportDailyZip ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-900">
                Reporte general operativo por día (ZIP)
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  aria-label="Fecha del ZIP operativo"
                  value={zipDate}
                  onChange={(e) => setZipDate(e.target.value)}
                  className="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                />
                <button
                  type="button"
                  disabled={busy || !zipDate}
                  onClick={() => void handleDailyZip()}
                  className="rounded-xl bg-blue-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  Generar ZIP operativo
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
