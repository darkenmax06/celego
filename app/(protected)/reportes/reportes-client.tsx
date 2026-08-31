"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  PhoneCall,
  Receipt,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { usePersistentState } from "@/lib/use-persistent-state";

const reportTypes = [
  { value: "tarjetas", label: "Tarjetas" },
  { value: "contactos", label: "Contactos" },
  { value: "facturacion", label: "Facturacion" },
  { value: "redaccion", label: "Entregas y Retornos" },
] as const;

const formats = ["xlsx", "csv", "pdf"] as const;

const CREDIT_STATUS_OPTIONS = [
  { value: "DESPACHADA", label: "Despachada" },
  { value: "ENVIADA_INTERIOR", label: "Enviada Interior" },
  { value: "EN_RUTA", label: "En Ruta" },
  { value: "ACUSE_RECIBIDO", label: "Acuse recibido" },
  { value: "DEVUELTA_TIENDA", label: "Devuelta a tienda" },
  { value: "ENTREGA_DIGITAL", label: "Entrega digital" },
  { value: "ENTREGADA", label: "Entregada" },
  { value: "RETORNADA", label: "Retornada" },
  { value: "NO_LOCALIZADO", label: "No localizado" },
] as const;

const DEBIT_STATUS_OPTIONS = [
  { value: "DESPACHADA", label: "Despachada" },
  { value: "EN_RUTA", label: "En Ruta" },
  { value: "TD_ENTREGADO", label: "TD- Entregado" },
  { value: "TD_DEVUELTO_NO_LOCALIZADO", label: "TD- Devuelto No Localizado" },
  { value: "TD_NO_LE_INTERESA", label: "TD- No le Interesa" },
  { value: "TD_RETIRADA_EN_OFICINA", label: "TD- Retirada en Oficina" },
  { value: "TD_SOLICITADA_POR_ERROR", label: "TD- Solicitada por Error" },
  { value: "TD_ZONA_FUERA_COBERTURA", label: "TD- Fuera de Cobertura" },
  { value: "NO_LOCALIZADO", label: "No localizado" },
] as const;

const CREDIT_STATUSES_SET = new Set<string>(["ALL", ...CREDIT_STATUS_OPTIONS.map((o) => o.value)]);
const DEBIT_STATUSES_SET = new Set<string>(["ALL", ...DEBIT_STATUS_OPTIONS.map((o) => o.value)]);

type QuickReportItem = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: typeof CheckCircle2;
  colorClass: string;
  params: Record<string, string | undefined>;
};

export default function ReportesClient() {
  const [type, setType] = usePersistentState<(typeof reportTypes)[number]["value"]>(
    "reportes:type",
    "tarjetas",
  );
  const [status, setStatus] = usePersistentState("reportes:status", "ALL");
  const [origin, setOrigin] = usePersistentState("reportes:origin", "ALL");
  const [cardType, setCardType] = usePersistentState("reportes:card-type", "ALL");
  const [zona, setZona] = usePersistentState("reportes:zone", "ALL");
  const [from, setFrom] = usePersistentState("reportes:from", "");
  const [to, setTo] = usePersistentState("reportes:to", "");

  const [message, setMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedQuickReport, setSelectedQuickReport] = useState<QuickReportItem | null>(null);

  // Discriminador de estado al cambiar de procedencia
  function handleOriginChange(newOrigin: string) {
    setOrigin(newOrigin);
    if (newOrigin === "BPD_DEBITO") {
      if (!DEBIT_STATUSES_SET.has(status)) {
        setStatus("ALL");
      }
    } else if (newOrigin === "TORRE_POPULAR" || newOrigin === "CENTRO_ACOPIO" || newOrigin === "SIN_PROCEDENCIA") {
      if (!CREDIT_STATUSES_SET.has(status)) {
        setStatus("ALL");
      }
    }
  }

  // Helper date generators for quick reports
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const startOfMonthStr = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01`;
  }, []);

  const quickReports: QuickReportItem[] = useMemo(
    () => [
      {
        id: "entregadas-hoy",
        title: "Tarjetas crédito entregadas hoy",
        subtitle: "Tarjetas de crédito en estado entregada en la fecha actual",
        badge: "Crédito entregadas",
        icon: CheckCircle2,
        colorClass: "text-emerald-600 bg-emerald-50 border-emerald-200 hover:border-emerald-400",
        params: {
          type: "tarjetas",
          status: "ENTREGADA",
          from: todayStr,
          to: todayStr,
        },
      },
      {
        id: "debito-entregadas-hoy",
        title: "Tarjetas débito entregadas hoy",
        subtitle: "Tarjetas de débito BPD con estado TD- Entregado hoy",
        badge: "BPD Débito entregadas",
        icon: CheckCircle2,
        colorClass: "text-teal-600 bg-teal-50 border-teal-200 hover:border-teal-400",
        params: {
          type: "tarjetas",
          origin: "BPD_DEBITO",
          status: "TD_ENTREGADO",
          from: todayStr,
          to: todayStr,
        },
      },
      {
        id: "retornadas-mes",
        title: "Tarjetas crédito retornadas del mes",
        subtitle: "Tarjetas de crédito retornadas acumuladas en el mes actual",
        badge: "Crédito retornadas",
        icon: RotateCcw,
        colorClass: "text-amber-600 bg-amber-50 border-amber-200 hover:border-amber-400",
        params: {
          type: "tarjetas",
          status: "RETORNADA",
          from: startOfMonthStr,
          to: todayStr,
        },
      },
      {
        id: "debito-devueltas-mes",
        title: "Tarjetas débito devueltas del mes",
        subtitle: "Tarjetas de débito BPD devueltas o no localizadas este mes",
        badge: "BPD Débito devueltas",
        icon: RotateCcw,
        colorClass: "text-orange-600 bg-orange-50 border-orange-200 hover:border-orange-400",
        params: {
          type: "tarjetas",
          origin: "BPD_DEBITO",
          status: "TD_DEVUELTO_NO_LOCALIZADO",
          from: startOfMonthStr,
          to: todayStr,
        },
      },
      {
        id: "facturacion-periodo",
        title: "Facturación del período",
        subtitle: "Cálculo y desglose de tarifas por entregas en el mes actual",
        badge: "Facturación",
        icon: Receipt,
        colorClass: "text-indigo-600 bg-indigo-50 border-indigo-200 hover:border-indigo-400",
        params: {
          type: "facturacion",
          from: startOfMonthStr,
          to: todayStr,
        },
      },
      {
        id: "contactos-operativos",
        title: "Contactos operativos",
        subtitle: "Bitácora completa de llamadas y gestiones de contacto con clientes",
        badge: "Contactos",
        icon: PhoneCall,
        colorClass: "text-sky-600 bg-sky-50 border-sky-200 hover:border-sky-400",
        params: {
          type: "contactos",
        },
      },
      {
        id: "urgencias-activas",
        title: "Tarjetas urgentes activas",
        subtitle: "Tarjetas marcadas como urgentes pendientes de entrega",
        badge: "Urgencias",
        icon: AlertTriangle,
        colorClass: "text-rose-600 bg-rose-50 border-rose-200 hover:border-rose-400",
        params: {
          type: "tarjetas",
          urgente: "true",
        },
      },
    ],
    [todayStr, startOfMonthStr],
  );

  async function exportFile(
    format: (typeof formats)[number],
    customParams?: Record<string, string | undefined>,
  ) {
    setIsExporting(true);
    setMessage("");

    const params = new URLSearchParams();

    if (customParams) {
      Object.entries(customParams).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      params.set("format", format);
    } else {
      params.set("type", type);
      params.set("format", format);

      if (status !== "ALL") params.set("status", status);
      if (origin !== "ALL") params.set("origin", origin);
      if (cardType !== "ALL") params.set("cardType", cardType);
      if (zona !== "ALL") params.set("zona", zona);

      if (type === "tarjetas" || type === "facturacion") {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }
    }

    try {
      const res = await fetch(`/api/reportes/export?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "No se pudo exportar" }));
        setMessage(data.error ?? "No se pudo exportar el reporte");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const reportLabel = customParams?.type ?? type;
      a.href = url;
      a.download = `reporte-${reportLabel}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Reporte ${format.toUpperCase()} generado y descargado correctamente`);
    } catch (err) {
      console.error("Error exportando reporte:", err);
      setMessage("Error inesperado al generar el archivo");
    } finally {
      setIsExporting(false);
      setSelectedQuickReport(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" subtitle="Exportacion en Excel, CSV y PDF con parametros de filtro" />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        {/* Filtros / Parámetros */}
        <Panel title="Parametros">
          <div className="space-y-3.5">
            <label className="block text-sm text-slate-600">
              <span className="font-medium text-slate-700">Tipo de reporte</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                {reportTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Selector de Origen del despacho (Procedencia) */}
            <label className="block text-sm text-slate-600">
              <span className="font-medium text-slate-700">Origen del despacho</span>
              <select
                value={origin}
                onChange={(e) => handleOriginChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                <option value="ALL">Todos los orígenes</option>
                <option value="TORRE_POPULAR">Torre Popular (Crédito)</option>
                <option value="CENTRO_ACOPIO">Centro de acopio (Crédito)</option>
                <option value="BPD_DEBITO">BPD Débito</option>
                <option value="SIN_PROCEDENCIA">Sin procedencia asignada</option>
              </select>
            </label>

            {/* Selector de Tipo de tarjeta (Principal / Adicional) */}
            {type === "tarjetas" ? (
              <label className="block text-sm text-slate-600">
                <span className="font-medium text-slate-700">Tipo de tarjeta</span>
                <select
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="ALL">Todos los tipos (Principal y Adicional)</option>
                  <option value="PRINCIPAL">Principal / Titular</option>
                  <option value="ADICIONAL">Adicional</option>
                </select>
              </label>
            ) : null}

            {/* Selector de Estado discriminado por Procedencia / Tipo de Tarjeta */}
            {type === "tarjetas" ? (
              <label className="block text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Estado</span>
                  {origin === "BPD_DEBITO" ? (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                      Estados Débito
                    </span>
                  ) : origin === "TORRE_POPULAR" || origin === "CENTRO_ACOPIO" || origin === "SIN_PROCEDENCIA" ? (
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                      Estados Crédito
                    </span>
                  ) : null}
                </div>

                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="ALL">Todos los estados</option>

                  {origin === "BPD_DEBITO" ? (
                    DEBIT_STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))
                  ) : origin === "TORRE_POPULAR" || origin === "CENTRO_ACOPIO" || origin === "SIN_PROCEDENCIA" ? (
                    CREDIT_STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))
                  ) : (
                    <>
                      <optgroup label="Tarjetas de Crédito">
                        {CREDIT_STATUS_OPTIONS.map((item) => (
                          <option key={`cred-${item.value}`} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Tarjetas de Débito (BPD)">
                        {DEBIT_STATUS_OPTIONS.filter((item) => item.value.startsWith("TD_")).map((item) => (
                          <option key={`deb-${item.value}`} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  )}
                </select>
              </label>
            ) : null}

            {/* Selector de Zona */}
            <label className="block text-sm text-slate-600">
              <span className="font-medium text-slate-700">Zona (tarjetas/redaccion)</span>
              <select
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                <option value="ALL">Todas las zonas</option>
                <option value="Metro">Metro</option>
                <option value="Este">Este</option>
                <option value="Norte">Norte</option>
                <option value="Sur">Sur</option>
              </select>
            </label>

            {/* Rango de fechas */}
            {type === "tarjetas" || type === "facturacion" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Despacho desde</span>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Despacho hasta</span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </Panel>

        {/* Panel Formatos de Salida y Reportes Rápidos */}
        <div className="space-y-6">
          <Panel title="Formatos de salida directa">
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void exportFile("xlsx")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 text-center transition hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-sm disabled:opacity-50"
              >
                <FileSpreadsheet className="h-6 w-6 text-emerald-600 transition group-hover:scale-110" />
                <span className="text-sm font-bold tracking-wide text-emerald-950 uppercase">Exportar XLSX</span>
                <span className="text-xs text-emerald-700">Tabla Excel completa</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => void exportFile("csv")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50/50 p-5 text-center transition hover:border-sky-400 hover:bg-sky-50 hover:shadow-sm disabled:opacity-50"
              >
                <FileText className="h-6 w-6 text-sky-600 transition group-hover:scale-110" />
                <span className="text-sm font-bold tracking-wide text-sky-950 uppercase">Exportar CSV</span>
                <span className="text-xs text-sky-700">Valores por comas</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => void exportFile("pdf")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 p-5 text-center transition hover:border-rose-400 hover:bg-rose-50 hover:shadow-sm disabled:opacity-50"
              >
                <Download className="h-6 w-6 text-rose-600 transition group-hover:scale-110" />
                <span className="text-sm font-bold tracking-wide text-rose-950 uppercase">Exportar PDF</span>
                <span className="text-xs text-rose-700">Documento con logo</span>
              </button>
            </div>

            {message ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800">
                {message}
              </div>
            ) : null}
          </Panel>

          {/* Accesos rápidos de exportación interactivos */}
          <Panel title="Reportes rápidos preconfigurados">
            <p className="mb-4 text-xs text-slate-500">
              Haz clic en cualquier reporte para seleccionar el formato de descarga (Excel, CSV o PDF):
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {quickReports.map((report) => {
                const IconComponent = report.icon;
                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedQuickReport(report)}
                    className="flex items-start gap-3.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-slate-400 hover:bg-slate-50/70 hover:shadow-sm focus:outline-none"
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${report.colorClass}`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{report.title}</p>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{report.subtitle}</p>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                        <Sparkles className="h-3 w-3 text-slate-400" />
                        <span>Clic para exportar</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      {/* Modal de Selección de Formato para Reporte Rápido */}
      {selectedQuickReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {selectedQuickReport.badge}
                </span>
                <h3 className="mt-1.5 text-lg font-bold text-slate-900">{selectedQuickReport.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{selectedQuickReport.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuickReport(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="my-5 border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Selecciona el formato de descarga:
              </p>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void exportFile("xlsx", selectedQuickReport.params)}
                  className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50 focus:outline-none disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-950">Excel (.xlsx)</p>
                      <p className="text-xs text-emerald-700">Hoja de cálculo con todos los campos</p>
                    </div>
                  </div>
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-emerald-700" /> : <Download className="h-4 w-4 text-emerald-700" />}
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void exportFile("csv", selectedQuickReport.params)}
                  className="flex w-full items-center justify-between rounded-xl border border-sky-200 bg-sky-50/40 p-3 text-left transition hover:border-sky-400 hover:bg-sky-50 focus:outline-none disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-sky-950">CSV (.csv)</p>
                      <p className="text-xs text-sky-700">Archivo separado por comas estándar</p>
                    </div>
                  </div>
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-sky-700" /> : <Download className="h-4 w-4 text-sky-700" />}
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void exportFile("pdf", selectedQuickReport.params)}
                  className="flex w-full items-center justify-between rounded-xl border border-rose-200 bg-rose-50/40 p-3 text-left transition hover:border-rose-400 hover:bg-rose-50 focus:outline-none disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                      <Download className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-rose-950">PDF (.pdf)</p>
                      <p className="text-xs text-rose-700">Documento imprimible con logo Celeritas</p>
                    </div>
                  </div>
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-rose-700" /> : <Download className="h-4 w-4 text-rose-700" />}
                </button>
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedQuickReport(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
