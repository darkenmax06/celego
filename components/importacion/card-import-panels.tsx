"use client";

import { ChangeEvent, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { notificationFailureMessage, notifyInBrowser } from "@/lib/browser-notifications";
import { cn } from "@/lib/utils";

type UrgentNotification = {
  urgentCaseId: string;
  cardId: string;
  tc: string;
  cliente: string;
  cedula: string;
  provincia: string;
  level: number;
  label: string;
  intervalMinutes: number;
  nextNotificationAt: string;
};

type RowError = { row?: number; message?: string };

type UploadStatus = {
  type: "success" | "error" | "info";
  message: string;
  details?: string;
};

/** Groups rejected-row reasons so a partial import never looks like a clean one. */
function summarizeRowErrors(errors: RowError[] | undefined) {
  if (!errors?.length) return undefined;
  const byReason = new Map<string, number[]>();
  for (const error of errors) {
    const reason = error.message?.trim() || "motivo no especificado";
    const rows = byReason.get(reason) ?? [];
    if (typeof error.row === "number") rows.push(error.row);
    byReason.set(reason, rows);
  }
  return [...byReason.entries()]
    .map(([reason, rows]) => {
      const shown = rows.slice(0, 10).join(", ");
      const rest = rows.length > 10 ? ` y ${rows.length - 10} más` : "";
      return rows.length ? `${reason} (${rows.length}): filas ${shown}${rest}` : reason;
    })
    .join(" — ");
}

/**
 * Credit (Torre / Acopio) and debit (BPD / Pinit) file importers.
 * Moved out of the Tarjetas page so that page only lists and filters cards.
 */
export function CardImportPanels() {
  const [activeUploader, setActiveUploader] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [notificationIssue, setNotificationIssue] = useState("");

  async function pullImmediateUrgentNotifications() {
    const res = await fetch("/api/operativo/urgencias", { cache: "no-store" });
    const json = await res.json().catch(() => ({ notifications: [] as UrgentNotification[] }));
    if (!res.ok) return 0;
    const notifications = (json.notifications ?? []) as UrgentNotification[];
    let issue = "";
    for (const item of notifications) {
      const result = await notifyInBrowser({
        title: `Urgencia activa: ${item.label}`,
        body: `${item.cliente} - TC ${item.tc} (${item.provincia})`,
        tag: `urgent-import-${item.urgentCaseId}`,
        requireInteraction: true,
      });
      issue = issue || notificationFailureMessage(result) || "";
    }
    setNotificationIssue(issue);
    return notifications.length;
  }

  async function uploadFile(endpoint: string, file: File, label: string) {
    setActiveUploader(endpoint);
    setUploadStatus({
      type: "info",
      message: `Subiendo y procesando "${file.name}" (${label})...`,
    });

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(endpoint, {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setUploadStatus({
          type: "error",
          message: data?.error ?? `Error en el servidor al importar "${file.name}" (código ${res.status})`,
          details: data?.errors?.length ? `${data.errors.length} filas con error en el archivo.` : undefined,
        });
        return;
      }

      // Build rich feedback per endpoint
      if (endpoint === "/api/tarjetas-debito/importar-consolidado") {
        const created = data.created ?? 0;
        const updated = data.updated ?? 0;
        const total = data.totalRows ?? data.count ?? (created + updated);
        let msg = data.replay
          ? `Consolidado Débito ya procesado anteriormente: ${created} creadas, ${updated} actualizadas.`
          : `Consolidado Débito importado con éxito: ${created} tarjetas creadas, ${updated} actualizadas (${total} filas procesadas).`;
        if (data.errors?.length) msg += ` (${data.errors.length} advertencias en filas).`;
        setUploadStatus({ type: "success", message: msg });
      } else if (endpoint === "/api/tarjetas-debito/importar-despacho") {
        const created = data.created ?? 0;
        const updated = data.updated ?? 0;
        const total = data.totalRows ?? data.count ?? (created + updated);
        let msg = data.replay
          ? `Despacho Débito ya procesado anteriormente: ${created} creadas, ${updated} actualizadas.`
          : `Despacho Débito importado con éxito: ${created} nuevas tarjetas creadas, ${updated} actualizadas (${total} filas procesadas).`;
        if (data.errors?.length) msg += ` (${data.errors.length} advertencias en filas).`;
        setUploadStatus({ type: "success", message: msg });
      } else if (endpoint === "/api/tarjetas-debito/importar-entregas") {
        const updated = data.updated ?? 0;
        const notFound = data.notFound ?? 0;
        const skipped = data.skipped ?? 0;
        const total = data.totalRows ?? data.count ?? (updated + notFound + skipped);
        const msg = `Entregas Pinit procesadas: ${updated} tarjetas actualizadas con estatus final de entrega (${total} filas).`;
        let details = "";
        if (notFound > 0) details += `${notFound} solicitudes no estaban registradas en el sistema. `;
        if (skipped > 0) details += `${skipped} registros omitidos sin estatus de entrega.`;
        setUploadStatus({
          type: notFound > 0 && updated === 0 ? "error" : "success",
          message: msg,
          details: details || undefined,
        });
      } else if (endpoint === "/api/tarjetas/importar") {
        const created = data.created ?? 0;
        const updated = data.updated ?? 0;
        const skipped = data.skipped ?? 0;
        const rejected = data.rejected ?? 0;
        const parsed = data.parsedRows ?? (created + updated + skipped);
        const totalRows = parsed + rejected;
        const msg = data.replay
          ? `Data Diaria Crédito ya procesada anteriormente: ${created} creadas, ${updated} actualizadas.`
          : `Data Diaria Crédito importada: ${created} creadas, ${updated} actualizadas, ${skipped} omitidas, ${rejected} rechazadas (${totalRows} filas en el archivo).`;
        // Rejected rows are dropped silently unless the reasons are surfaced here.
        const reasons = summarizeRowErrors(data.errors);
        setUploadStatus({
          type: rejected > 0 ? "error" : "success",
          message: msg,
          details: reasons,
        });
      } else if (endpoint === "/api/importaciones/urgentes") {
        const linked = data.linked ?? 0;
        const notFound = data.notFound ?? 0;
        const imported = data.imported ?? (linked + notFound);
        let msg = `Urgencias importadas: ${linked} tarjetas vinculadas, ${notFound} casos pendientes registrados (${imported} filas).`;
        const emitted = await pullImmediateUrgentNotifications();
        if (emitted > 0) msg += ` Notificaciones inmediatas enviadas: ${emitted}.`;
        setUploadStatus({ type: "success", message: msg });
      } else {
        const importedCount = data.imported ?? data.parsedRows ?? data.count ?? 0;
        setUploadStatus({ type: "success", message: `Importación completada con éxito (${importedCount} filas procesadas).` });
      }
    } catch (err) {
      setUploadStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Error inesperado al procesar archivo",
      });
    } finally {
      setActiveUploader(null);
    }
  }

  const onUpload = (endpoint: string, label: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void uploadFile(endpoint, file, label);
    event.target.value = "";
  };

  return (
    <div className="flex flex-col gap-5">
      {uploadStatus ? (
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xs transition animate-in fade-in slide-in-from-top-1",
            uploadStatus.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
            uploadStatus.type === "error" && "border-rose-200 bg-rose-50 text-rose-900",
            uploadStatus.type === "info" && "border-blue-200 bg-blue-50 text-blue-900",
          )}
        >
          <div className="flex items-start gap-2.5">
            {uploadStatus.type === "success" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
            {uploadStatus.type === "error" && <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />}
            {uploadStatus.type === "info" && <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-600" />}
            <div>
              <p className="font-semibold">{uploadStatus.message}</p>
              {uploadStatus.details ? (
                <p className="text-xs opacity-85 mt-1 leading-relaxed">{uploadStatus.details}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUploadStatus(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-slate-200/50"
            title="Cerrar mensaje"
          >
            ✕
          </button>
        </div>
      ) : null}
      {notificationIssue ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {notificationIssue}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Crédito (Torre / Acopio)" subtitle="Importaciones de tarjetas de crédito">
          <div className="grid gap-3 sm:grid-cols-2">
            <Uploader
              label="Importar Data Diaria"
              description="Tarjetas de Torre Popular o Centro de Acopio"
              endpoint="/api/tarjetas/importar"
              activeEndpoint={activeUploader}
              onUpload={onUpload}
            />
            <Uploader
              label="Importar Urgentes"
              description="Alertas operativas y casos urgentes"
              endpoint="/api/importaciones/urgentes"
              activeEndpoint={activeUploader}
              onUpload={onUpload}
            />
          </div>
        </Panel>

        <Panel
          title="Débito (BPD / Pinit)"
          subtitle="Flujo diario de tarjetas de débito (puedes ejecutar cada paso de forma independiente)"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Uploader
              label="1. Consolidado"
              description="Carga / actualiza consolidado general"
              endpoint="/api/tarjetas-debito/importar-consolidado"
              activeEndpoint={activeUploader}
              onUpload={onUpload}
            />
            <Uploader
              label="2. Despacho"
              description="Ingresa nuevas tarjetas de despacho"
              endpoint="/api/tarjetas-debito/importar-despacho"
              activeEndpoint={activeUploader}
              onUpload={onUpload}
            />
            <Uploader
              label="3. Entregas Pinit"
              description="Actualiza estatus finales desde Pinit"
              endpoint="/api/tarjetas-debito/importar-entregas"
              activeEndpoint={activeUploader}
              onUpload={onUpload}
            />
          </div>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/tarjetas-debito/exportar-consolidado"
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                title="Descarga el archivo Consolidado con los comentarios, estatus y entregas actualizadas desde Celego"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                Descargar Consolidado Actualizado
              </a>
              <a
                href="/api/tarjetas-debito/exportar-pinit"
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition shadow-2xs"
                title="Genera el archivo de despacho diario formateado para subir a Pinit"
              >
                <Download className="h-3.5 w-3.5 text-blue-600" />
                Descargar Pinit del Día
              </a>
            </div>
            <span className="text-[11px] text-slate-400">
              * Acciones independientes
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Uploader({
  label,
  endpoint,
  activeEndpoint,
  onUpload,
  description,
}: {
  label: string;
  endpoint: string;
  activeEndpoint: string | null;
  onUpload: (endpoint: string, label: string) => (event: ChangeEvent<HTMLInputElement>) => void;
  description?: string;
}) {
  const isUploading = activeEndpoint === endpoint;
  const isAnyUploading = activeEndpoint !== null;

  return (
    <label
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border border-dashed px-3 py-4 text-center transition select-none min-h-[90px]",
        isUploading
          ? "border-blue-500 bg-blue-50/60 text-blue-900 ring-2 ring-blue-400 cursor-wait animate-pulse"
          : isAnyUploading
            ? "border-slate-200 bg-slate-50/50 text-slate-400 opacity-60 cursor-not-allowed pointer-events-none"
            : "cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50/80 hover:text-slate-900 shadow-2xs",
      )}
    >
      <input
        type="file"
        className="hidden"
        accept=".xlsx,.xls,.csv"
        disabled={isAnyUploading}
        onChange={onUpload(endpoint, label)}
      />
      {isUploading ? (
        <div className="flex flex-col items-center justify-center gap-1.5 text-blue-700">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-xs font-semibold">Procesando archivo...</span>
        </div>
      ) : (
        <>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
            {label}
          </span>
          {description ? (
            <span className="mt-1 text-[11px] text-slate-500 font-normal leading-tight">
              {description}
            </span>
          ) : null}
        </>
      )}
    </label>
  );
}
