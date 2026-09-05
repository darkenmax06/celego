"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { FilterBar, ViewType } from "@/components/filters/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { notificationFailureMessage, notifyInBrowser } from "@/lib/browser-notifications";
import { usePersistentState } from "@/lib/use-persistent-state";

type CardRow = {
  id: string;
  tc: string;
  requestNumber?: string | null;
  productType?: "CREDITO" | "DEBITO" | null;
  provincia: string;
  zona: string;
  isRemote: boolean;
  isAdditional: boolean;
  additionalIndex: number;
  status: string;
  urgent: boolean;
  dispatchOrigin: "TORRE_POPULAR" | "CENTRO_ACOPIO" | "BPD_DEBITO" | null;
  dispatchDate: string | null;
  customer: { nombre: string; cedula: string };
  currentMessenger?: { nombre: string } | null;
  activeUrgentCase: {
    id: string;
    level: number;
    nextNotificationAt: string | null;
    lastNotifiedAt: string | null;
  } | null;
  contactado?: boolean;
  contactoEstado?: string;
  canalContacto?: string | null;
  solicitudRetorno?: boolean;
  motivoRetorno?: string | null;
  traslado?: Record<string, unknown> | null;
  nuevaDireccion?: string | null;
  fechaPreferenciaEntrega?: string | null;
  comentarioContacto?: string | null;
  metadata?: unknown;
};

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type CardsResponse = { cards: CardRow[]; pagination?: PaginationMeta };

type UrgencyPayload = {
  cardId: string;
  urgent: boolean;
  level?: number;
  resolve?: boolean;
  note?: string;
};

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

type UrgencyMutationResponse = {
  urgent?: boolean;
  label?: string;
  notifyNow?: boolean;
  notification?: UrgentNotification | null;
  error?: string;
};

function urgencyClasses(level: number | null) {
  if (level === 5) return "border-red-600 bg-red-100 text-red-900";
  if (level === 4) return "border-rose-500 bg-rose-100 text-rose-900";
  if (level === 3) return "border-orange-500 bg-orange-100 text-orange-900";
  if (level === 2) return "border-amber-500 bg-amber-100 text-amber-900";
  if (level === 1) return "border-yellow-500 bg-yellow-100 text-yellow-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function urgencyLabel(level: number) {
  if (level === 5) return "Nivel 5";
  if (level === 4) return "Nivel 4";
  if (level === 3) return "Nivel 3";
  if (level === 2) return "Nivel 2";
  return "Nivel 1";
}

function formatUrgentClock(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO");
}

import React, { useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TableColumnSelector } from "@/components/ui/table-column-selector";
import {
  useResizableColumns,
  ResizableHeader,
} from "@/components/ui/use-resizable-columns";

const TARJETA_COLUMNS = [
  { key: "tc", label: "TC", locked: true },
  { key: "contactoEstado", label: "Gestión Contacto" },
  { key: "producto", label: "Producto" },
  { key: "cliente", label: "Cliente" },
  { key: "cedula", label: "Cédula" },
  { key: "provincia", label: "Provincia" },
  { key: "zona", label: "Zona" },
  { key: "remota", label: "Remota" },
  { key: "tipo", label: "Tipo" },
  { key: "origen", label: "Origen" },
  { key: "estado", label: "Estado" },
  { key: "urgente", label: "Urgente" },
  { key: "nivel", label: "Nivel" },
  { key: "proximaAlerta", label: "Próxima alerta" },
] as const;

type TarjetaColumnKey = (typeof TARJETA_COLUMNS)[number]["key"];

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  tc: 150,
  contactoEstado: 160,
  producto: 110,
  cliente: 240,
  cedula: 130,
  provincia: 140,
  zona: 130,
  remota: 90,
  tipo: 120,
  origen: 150,
  estado: 140,
  urgente: 90,
  nivel: 100,
  proximaAlerta: 150,
  acciones: 130,
};

function getCardGroupKey(card: CardRow, groupBy: string): { key: string; label: string } {
  switch (groupBy) {
    case "contactoEstado": {
      if (card.contactoEstado === "RETORNO_SOLICITADO") return { key: "RETORNO_SOLICITADO", label: "⚠ Retorno Solicitado" };
      if (card.contactoEstado === "TRASLADO_SOLICITADO") return { key: "TRASLADO_SOLICITADO", label: "✈ Traslado Solicitado" };
      if (card.contactoEstado === "CONTACTADA") return { key: "CONTACTADA", label: "✓ Contactadas" };
      return { key: "NO_CONTACTADA", label: "○ No Contactadas / Pendientes" };
    }
    case "productType": {
      return {
        key: card.productType || "CREDITO",
        label: card.productType === "DEBITO" ? "Débito" : "Crédito",
      };
    }
    case "origin": {
      const origin = card.dispatchOrigin;
      if (origin === "TORRE_POPULAR") return { key: "TORRE_POPULAR", label: "Torre Popular" };
      if (origin === "CENTRO_ACOPIO") return { key: "CENTRO_ACOPIO", label: "Centro de Acopio" };
      if (origin === "BPD_DEBITO") return { key: "BPD_DEBITO", label: "BPD Débito" };
      return { key: "NONE", label: "Sin procedencia" };
    }
    case "status": {
      return { key: card.status || "SIN_ESTADO", label: card.status || "Sin Estado" };
    }
    case "provincia": {
      return { key: card.provincia || "SIN_PROVINCIA", label: card.provincia || "Sin Provincia" };
    }
    case "zona": {
      return { key: card.zona || "SIN_ZONA", label: card.zona || "Sin Zona" };
    }
    case "urgent": {
      return card.urgent
        ? { key: "URGENT", label: "Urgentes" }
        : { key: "NORMAL", label: "No Urgentes" };
    }
    case "remota":
    case "isRemote": {
      return card.isRemote
        ? { key: "REMOTA", label: "Remotas" }
        : { key: "LOCAL", label: "Locales (No remotas)" };
    }
    case "tipo":
    case "isAdditional": {
      return card.isAdditional
        ? { key: `ADICIONAL_${card.additionalIndex}`, label: `Adicional ${card.additionalIndex}` }
        : { key: "PRINCIPAL", label: "Principal" };
    }
    case "cliente":
    case "customer": {
      return { key: card.customer?.nombre || "SIN_CLIENTE", label: card.customer?.nombre || "Sin Cliente" };
    }
    case "cedula": {
      return { key: card.customer?.cedula || "SIN_CEDULA", label: card.customer?.cedula || "Sin Cédula" };
    }
    default: {
      const val = (card as unknown as Record<string, unknown>)[groupBy];
      if (val !== undefined && val !== null) {
        return { key: String(val), label: String(val) };
      }
      return { key: "ALL", label: "General" };
    }
  }
}

const URL_FILTER_KEYS = ["status", "zona", "provincia", "urgent", "from", "to", "origin", "remote", "productType", "contactoEstado"] as const;

type RowError = { row?: number; message?: string };

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

export default function TarjetasClient() {
  const searchParams = useSearchParams();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = { page: "1", pageSize: "25" };
    for (const key of URL_FILTER_KEYS) {
      const value = searchParams.get(key);
      if (value) initial[key] = value;
    }
    return initial;
  });
  const [viewMode, setViewMode] = useState<ViewType>("list");
  const [visibleColumns, setVisibleColumns] = usePersistentState<TarjetaColumnKey[]>(
    "tarjetas:visible-columns",
    TARJETA_COLUMNS.map((c) => c.key),
  );
  const { widths: columnWidths, updateWidth: onColumnResize } = useResizableColumns(
    "tarjetas",
    DEFAULT_COLUMN_WIDTHS,
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [activeUploader, setActiveUploader] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
    details?: string;
  } | null>(null);
  const [notificationIssue, setNotificationIssue] = useState("");
  const [selectedCardId, setSelectedCardId] = usePersistentState<string | null>(
    "tarjetas:selected-card",
    null,
  );
  const [urgencyTarget, setUrgencyTarget] = useState<CardRow | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });

  async function fetchCards(currentFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(currentFilters).forEach(([k, v]) => {
      if (v && v !== "ALL") params.set(k, v);
    });

    const res = await fetch(`/api/tarjetas?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as CardsResponse;
    setCards(json.cards ?? []);
    if (json.pagination) {
      setPagination(json.pagination);
    }
    setLoading(false);
  }

  useEffect(() => {
    void fetchCards(filters);
  }, [filters]);

  const groupedCards = useMemo(() => {
    if (!filters.groupBy) return null;
    const groups: Record<string, { groupKey: string; groupLabel: string; items: CardRow[] }> = {};
    for (const card of cards) {
      const { key, label } = getCardGroupKey(card, filters.groupBy);
      if (!groups[key]) {
        groups[key] = { groupKey: key, groupLabel: label, items: [] };
      }
      groups[key].items.push(card);
    }
    return Object.values(groups);
  }, [cards, filters.groupBy]);

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

      await fetchCards(filters);
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

  async function onSaveUrgency(payload: UrgencyPayload): Promise<string | null> {
    const res = await fetch("/api/operativo/urgencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as UrgencyMutationResponse;
    if (!res.ok) {
      return json.error ?? "No se pudo guardar la urgencia";
    }

    if (json.notifyNow && json.notification) {
      const result = await notifyInBrowser({
        title: `Urgencia activa: ${json.notification.label}`,
        body: `${json.notification.cliente} - TC ${json.notification.tc}. Primera notificacion enviada.`,
        tag: `urgent-now-${json.notification.urgentCaseId}`,
        requireInteraction: true,
      });
      const warning = notificationFailureMessage(result);
      if (warning) {
        setNotificationIssue(warning);
      } else {
        setNotificationIssue("");
      }
    }

    await fetchCards(filters);
    return null;
  }

  const renderCardRow = (card: CardRow) => (
    <tr key={card.id} className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors">
      {visibleColumns.includes("tc") ? (
        <td
          className="cursor-pointer px-3 py-2.5 font-mono font-bold text-blue-700 hover:underline truncate"
          onClick={() => setSelectedCardId(card.id)}
          title={card.tc}
        >
          {card.tc}
        </td>
      ) : null}
      {visibleColumns.includes("contactoEstado") ? (
        <td className="px-3 py-2.5 truncate">
          {card.solicitudRetorno || card.contactoEstado === "RETORNO_SOLICITADO" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-bold text-rose-700">
              ⚠ Retorno
            </span>
          ) : card.traslado || card.contactoEstado === "TRASLADO_SOLICITADO" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700">
              ✈ Traslado
            </span>
          ) : card.contactado || card.contactoEstado === "CONTACTADA" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-700">
              ✓ Contactada {card.canalContacto ? `(${card.canalContacto})` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
              ○ No contactada
            </span>
          )}
        </td>
      ) : null}
      {visibleColumns.includes("producto") ? (
        <td className="px-3 py-2.5 truncate">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
              card.productType === "DEBITO"
                ? "bg-amber-100 text-amber-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {card.productType === "DEBITO" ? "Débito" : "Crédito"}
          </span>
        </td>
      ) : null}
      {visibleColumns.includes("cliente") ? (
        <td
          className="cursor-pointer px-3 py-2.5 font-medium text-slate-900 hover:underline truncate"
          onClick={() => setSelectedCardId(card.id)}
          title={card.customer.nombre}
        >
          {card.customer.nombre}
        </td>
      ) : null}
      {visibleColumns.includes("cedula") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={card.customer.cedula}>{card.customer.cedula}</td>
      ) : null}
      {visibleColumns.includes("provincia") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={card.provincia}>{card.provincia}</td>
      ) : null}
      {visibleColumns.includes("zona") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={card.zona}>{card.zona}</td>
      ) : null}
      {visibleColumns.includes("remota") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">{card.isRemote ? "SÍ" : "NO"}</td>
      ) : null}
      {visibleColumns.includes("tipo") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">
          <span className="truncate block">
            {card.isAdditional ? `ADIC. ${card.additionalIndex}` : "PRINCIPAL"}
          </span>
        </td>
      ) : null}
      {visibleColumns.includes("origen") ? (
        <td
          className="px-3 py-2.5 text-slate-600 truncate"
          title={
            card.dispatchOrigin === "CENTRO_ACOPIO"
              ? "Centro de acopio"
              : card.dispatchOrigin === "TORRE_POPULAR"
                ? "Torre Popular"
                : card.dispatchOrigin === "BPD_DEBITO"
                  ? "BPD Débito"
                  : "Sin procedencia"
          }
        >
          <span className="truncate block">
            {card.dispatchOrigin === "CENTRO_ACOPIO"
              ? "Centro de acopio"
              : card.dispatchOrigin === "TORRE_POPULAR"
                ? "Torre Popular"
                : card.dispatchOrigin === "BPD_DEBITO"
                  ? "BPD Débito"
                  : "Sin procedencia"}
          </span>
        </td>
      ) : null}
      {visibleColumns.includes("estado") ? (
        <td className="px-3 py-2.5 truncate">
          <StatusBadge value={card.status} />
        </td>
      ) : null}
      {visibleColumns.includes("urgente") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">{card.urgent ? "SÍ" : "NO"}</td>
      ) : null}
      {visibleColumns.includes("nivel") ? (
        <td className="px-3 py-2.5 truncate">
          {card.activeUrgentCase ? (
            <span
              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${urgencyClasses(card.activeUrgentCase.level)}`}
            >
              {urgencyLabel(card.activeUrgentCase.level)}
            </span>
          ) : (
            "-"
          )}
        </td>
      ) : null}
      {visibleColumns.includes("proximaAlerta") ? (
        <td className="px-3 py-2.5 text-xs text-slate-600 truncate">
          {formatUrgentClock(card.activeUrgentCase?.nextNotificationAt ?? null)}
        </td>
      ) : null}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setUrgencyTarget(card)}
            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            Urgencia
          </button>
          <button
            type="button"
            onClick={() => setSelectedCardId(card.id)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ver
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Tarjetas" subtitle="Importacion, consulta y clasificacion de tarjetas" />

      {/* FilterBar Odoo Style */}
      <FilterBar
        resource="tarjetas"
        sectionKey="tarjetas"
        filters={filters}
        onFilterChange={(next) => setFilters({ ...next, page: "1", pageSize: filters.pageSize || "25" })}
        onReset={() => setFilters({ page: "1", pageSize: "25" })}
        searchPlaceholder="Buscar por TC, cédula, nombre o referencia..."
        allowedViews={["list", "cards"]}
        currentView={viewMode}
        onViewChange={setViewMode}
        facets={[
          {
            field: "contactoEstado",
            label: "Gestión Contacto",
            options: [
              { label: "Contactadas", value: "CONTACTADA" },
              { label: "No contactadas / Pendientes", value: "NO_CONTACTADA" },
              { label: "Retorno solicitado", value: "RETORNO_SOLICITADO" },
              { label: "Traslado solicitado", value: "TRASLADO_SOLICITADO" },
            ],
          },
          {
            field: "productType",
            label: "Producto",
            options: [
              { label: "Crédito", value: "CREDITO" },
              { label: "Débito", value: "DEBITO" },
            ],
          },
          { field: "status", label: "Estado", multi: true },
          { field: "provincia", label: "Provincia", multi: true },
          { field: "zona", label: "Zona", multi: true },
          {
            field: "origin",
            label: "Origen",
            options: [
              { label: "Torre Popular", value: "TORRE_POPULAR" },
              { label: "Centro de Acopio", value: "CENTRO_ACOPIO" },
              { label: "BPD Débito", value: "BPD_DEBITO" },
            ],
          },
          {
            field: "urgent",
            label: "Urgente",
            options: [{ label: "Solo urgentes", value: "1" }],
          },
        ]}
        groupByOptions={[
          { field: "contactoEstado", label: "Gestión Contacto" },
          { field: "productType", label: "Producto" },
          { field: "origin", label: "Origen" },
          { field: "status", label: "Estado" },
          { field: "provincia", label: "Provincia" },
          { field: "zona", label: "Zona" },
        ]}
      />

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

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {loading ? "Cargando..." : `Listado de tarjetas (${pagination.total})`}
            </h2>
            {filters.groupBy ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Agrupado por: {filters.groupBy}
              </span>
            ) : null}
          </div>
          {viewMode === "list" ? (
            <TableColumnSelector
              columns={TARJETA_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
            />
          ) : null}
        </div>

        {viewMode === "cards" ? (
          /* Cards View (Grouped or Flat) */
          groupedCards ? (
            <div className="space-y-6">
              {groupedCards.map((group) => {
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
                          {group.items.length}{" "}
                          {group.items.length === 1 ? "tarjeta" : "tarjetas"}
                        </span>
                      </div>
                    </div>
                    {!isCollapsed ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {group.items.map((card) => (
                          <div
                            key={card.id}
                            className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-slate-300"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <span className="font-mono text-sm font-bold text-blue-700">{card.tc}</span>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {card.solicitudRetorno || card.contactoEstado === "RETORNO_SOLICITADO" ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                      ⚠ Retorno
                                    </span>
                                  ) : card.traslado || card.contactoEstado === "TRASLADO_SOLICITADO" ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                      ✈ Traslado
                                    </span>
                                  ) : card.contactado || card.contactoEstado === "CONTACTADA" ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                      ✓ Contactada
                                    </span>
                                  ) : null}
                                  <StatusBadge value={card.status} />
                                </div>
                              </div>
                              <h4 className="mt-2 font-semibold text-slate-900">{card.customer.nombre}</h4>
                              <p className="text-xs text-slate-500">Cédula: {card.customer.cedula}</p>
                              <p className="mt-2 text-xs text-slate-600">
                                {card.provincia} • {card.zona} {card.isRemote ? "(Remota)" : ""}
                              </p>
                            </div>
                            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                              <span className="text-xs text-slate-400">
                                {card.isAdditional ? `Adic. ${card.additionalIndex}` : "Principal"}
                              </span>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setUrgencyTarget(card)}
                                  className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                >
                                  Urgencia
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedCardId(card.id)}
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Ver
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!groupedCards.length && !loading ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No hay tarjetas que coincidan con estos filtros.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-slate-300"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-blue-700">{card.tc}</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {card.solicitudRetorno || card.contactoEstado === "RETORNO_SOLICITADO" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            ⚠ Retorno
                          </span>
                        ) : card.traslado || card.contactoEstado === "TRASLADO_SOLICITADO" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                            ✈ Traslado
                          </span>
                        ) : card.contactado || card.contactoEstado === "CONTACTADA" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            ✓ Contactada
                          </span>
                        ) : null}
                        <StatusBadge value={card.status} />
                      </div>
                    </div>
                    <h4 className="mt-2 font-semibold text-slate-900">{card.customer.nombre}</h4>
                    <p className="text-xs text-slate-500">Cédula: {card.customer.cedula}</p>
                    <p className="mt-2 text-xs text-slate-600">
                      {card.provincia} • {card.zona} {card.isRemote ? "(Remota)" : ""}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-400">
                      {card.isAdditional ? `Adic. ${card.additionalIndex}` : "Principal"}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setUrgencyTarget(card)}
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Urgencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCardId(card.id)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Ver
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!cards.length && !loading ? (
                <p className="col-span-full py-8 text-center text-sm text-slate-500">
                  No hay tarjetas que coincidan con estos filtros.
                </p>
              ) : null}
            </div>
          )
        ) : (
          /* Table View with Horizontal Scroll & Resizable Headers */
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1100px] text-left text-sm table-fixed">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600 border-b border-slate-200">
                <tr>
                  {visibleColumns.includes("tc") ? (
                    <ResizableHeader
                      columnKey="tc"
                      label="TC"
                      width={columnWidths.tc}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("contactoEstado") ? (
                    <ResizableHeader
                      columnKey="contactoEstado"
                      label="Gestión Contacto"
                      width={columnWidths.contactoEstado}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("producto") ? (
                    <ResizableHeader
                      columnKey="producto"
                      label="Producto"
                      width={columnWidths.producto}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("cliente") ? (
                    <ResizableHeader
                      columnKey="cliente"
                      label="Cliente"
                      width={columnWidths.cliente}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("cedula") ? (
                    <ResizableHeader
                      columnKey="cedula"
                      label="Cédula"
                      width={columnWidths.cedula}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("provincia") ? (
                    <ResizableHeader
                      columnKey="provincia"
                      label="Provincia"
                      width={columnWidths.provincia}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("zona") ? (
                    <ResizableHeader
                      columnKey="zona"
                      label="Zona"
                      width={columnWidths.zona}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("remota") ? (
                    <ResizableHeader
                      columnKey="remota"
                      label="Remota"
                      width={columnWidths.remota}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("tipo") ? (
                    <ResizableHeader
                      columnKey="tipo"
                      label="Tipo"
                      width={columnWidths.tipo}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("origen") ? (
                    <ResizableHeader
                      columnKey="origen"
                      label="Origen"
                      width={columnWidths.origen}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("estado") ? (
                    <ResizableHeader
                      columnKey="estado"
                      label="Estado"
                      width={columnWidths.estado}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("urgente") ? (
                    <ResizableHeader
                      columnKey="urgente"
                      label="Urgente"
                      width={columnWidths.urgente}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("nivel") ? (
                    <ResizableHeader
                      columnKey="nivel"
                      label="Nivel"
                      width={columnWidths.nivel}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("proximaAlerta") ? (
                    <ResizableHeader
                      columnKey="proximaAlerta"
                      label="Próxima alerta"
                      width={columnWidths.proximaAlerta}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  <th
                    style={{ width: `${columnWidths.acciones}px` }}
                    className="px-3 pb-2.5 pt-1 text-right text-xs uppercase text-slate-500 font-semibold"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedCards ? (
                  /* Odoo Grouped Accordion Rows */
                  groupedCards.map((group) => {
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
                          className="cursor-pointer bg-slate-100/90 font-semibold text-slate-900 transition hover:bg-slate-200/80 select-none border-y border-slate-200"
                        >
                          <td colSpan={visibleColumns.length + 1} className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-slate-600" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-slate-600" />
                              )}
                              <span className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                                Grupo:
                              </span>
                              <span className="text-sm font-bold text-slate-900">
                                {group.groupLabel}
                              </span>
                              <span className="rounded-full bg-slate-200/90 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                {group.items.length}{" "}
                                {group.items.length === 1 ? "tarjeta" : "tarjetas"}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {!isCollapsed
                          ? group.items.map((card) => renderCardRow(card))
                          : null}
                      </React.Fragment>
                    );
                  })
                ) : (
                  /* Standard Flat Rows */
                  cards.map((card) => renderCardRow(card))
                )}
                {!cards.length ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="py-8 text-center text-sm text-slate-500">
                      {loading ? "Cargando..." : "No hay tarjetas que coincidan con estos filtros."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 || pagination.total > 10 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>
                Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> ({pagination.total} total)
              </span>
              <span className="text-slate-300">|</span>
              <label className="flex items-center gap-1">
                <span>Por página:</span>
                <select
                  value={filters.pageSize || "25"}
                  onChange={(e) => setFilters((prev) => ({ ...prev, pageSize: e.target.value, page: "1" }))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.max(1, pagination.page - 1)) }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setFilters((prev) => ({ ...prev, page: String(pagination.page + 1) }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      {selectedCardId ? (
        <CardDetailModal
          cardId={selectedCardId}
          onClose={() => setSelectedCardId(null)}
          onUpdated={() => {
            void fetchCards(filters);
          }}
        />
      ) : null}
      {urgencyTarget ? (
        <UrgencyModal
          card={urgencyTarget}
          onClose={() => setUrgencyTarget(null)}
          onSave={onSaveUrgency}
        />
      ) : null}
    </div>
  );
}

function UrgencyModal({
  card,
  onClose,
  onSave,
}: {
  card: CardRow;
  onClose: () => void;
  onSave: (payload: UrgencyPayload) => Promise<string | null>;
}) {
  const [enabled, setEnabled] = useState(card.urgent);
  const [level, setLevel] = useState(card.activeUrgentCase?.level ?? 1);
  const [urgencyComment, setUrgencyComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const save = async () => {
    setSaving(true);
    setFeedback("");
    const err = await onSave({
      cardId: card.id,
      urgent: enabled,
      level,
      note: urgencyComment.trim() || undefined,
    });
    setSaving(false);
    if (err) {
      setFeedback(err);
      return;
    }
    onClose();
  };

  const resolve = async () => {
    setSaving(true);
    setFeedback("");
    const err = await onSave({
      cardId: card.id,
      urgent: false,
      resolve: true,
      note: urgencyComment.trim() || undefined,
    });
    setSaving(false);
    if (err) {
      setFeedback(err);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-rose-700">Gestion de urgencia</p>
            <h3 className="text-lg font-bold text-slate-900">
              {card.customer.nombre} - {card.tc}
            </h3>
            <p className="text-xs text-slate-500">{card.customer.cedula}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-3">
          <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Marcar tarjeta como urgente
          </label>

          {enabled ? (
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nivel de urgencia
              <select
                value={level}
                onChange={(event) => setLevel(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-700"
              >
                <option value={1}>Nivel 1 (Leve) - cada 4.5 horas</option>
                <option value={2}>Nivel 2 (Moderada) - cada 3.5 horas</option>
                <option value={3}>Nivel 3 (Alta) - cada 2.5 horas</option>
                <option value={4}>Nivel 4 (Muy urgente) - cada 1.5 horas</option>
                <option value={5}>Nivel 5 (Extremadamente urgente) - cada 30 min</option>
              </select>
            </label>
          ) : null}

          <div className="mt-3 text-xs text-slate-600">
            <p>Ultima alerta: {formatUrgentClock(card.activeUrgentCase?.lastNotifiedAt ?? null)}</p>
            <p>Proxima alerta: {formatUrgentClock(card.activeUrgentCase?.nextNotificationAt ?? null)}</p>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comentario de urgencia
            </label>
            <textarea
              value={urgencyComment}
              onChange={(event) => setUrgencyComment(event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Ej: confirmar entrega hoy, cliente requiere prioridad..."
            />
          </div>
        </div>

        {feedback ? <p className="mt-3 text-sm text-rose-700">{feedback}</p> : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {card.urgent ? (
            <button
              type="button"
              onClick={() => void resolve()}
              disabled={saving}
              className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
            >
              Marcar como resuelto
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar urgencia"}
          </button>
        </div>
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
