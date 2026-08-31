"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { usePersistentState } from "@/lib/use-persistent-state";
import { OperativeContactWizard, type PhoneState, type OperativeWizardCard } from "@/components/operativo/operative-contact-wizard";
import { SLAExtensionRequestsTable } from "@/components/operativo/sla-extension-requests-table";
import { FilterBar, ViewType } from "@/components/filters/filter-bar";
import {
  Phone,
  AlertTriangle,
  Send,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type OperativeTab =
  | "activos"
  | "contactadas"
  | "no-contactadas"
  | "urgentes"
  | "traslados"
  | "retorno"
  | "extensiones-sla";

type ExportFormat = "xlsx" | "csv" | "pdf";

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type OperativoResponse = { cards: OperativeWizardCard[]; pagination?: PaginationMeta };
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

const STATUS_OPTIONS = [
  { value: "ALL", label: "Todos los status" },
  { value: "DESPACHADA", label: "Despachada" },
  { value: "EN_RUTA", label: "En ruta" },
  { value: "ACUSE_RECIBIDO", label: "Acuse recibido" },
  { value: "DEVUELTA_TIENDA", label: "Devuelta a tienda" },
  { value: "ENTREGA_DIGITAL", label: "Entrega digital" },
  { value: "ENTREGADA", label: "Entregada" },
  { value: "RETORNADA", label: "Retornada" },
  { value: "EN_PROCESO", label: "En proceso" },
  { value: "TD_ENTREGADO", label: "TD- Entregado" },
  { value: "TD_DEVUELTO_NO_LOCALIZADO", label: "TD- Devuelto No Localizado" },
  { value: "TD_NO_LE_INTERESA", label: "TD- No le Interesa" },
  { value: "TD_RETIRADA_EN_OFICINA", label: "TD- Retirada en Oficina" },
  { value: "TD_SOLICITADA_POR_ERROR", label: "TD- Solicitada por Error" },
  { value: "TD_ZONA_FUERA_COBERTURA", label: "TD- Fuera de Cobertura" },
  { value: "NO_LOCALIZADO", label: "No Localizado" },
] as const;

function normalizeStatus(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function statusClasses(value: string) {
  const key = normalizeStatus(value);
  if (key === "RETORNADA" || key === "DEVUELTA_TIENDA") return "text-rose-700 bg-rose-50 border-rose-200";
  if (key === "ACUSE_RECIBIDO" || key === "ENTREGADA" || key === "ENTREGA_DIGITAL")
    return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (key === "EN_RUTA" || key === "EN_PROCESO") return "text-sky-700 bg-sky-50 border-sky-200";
  if (key === "DESPACHADA") return "text-indigo-700 bg-indigo-50 border-indigo-200";
  return "text-slate-700 bg-slate-100 border-slate-200";
}

function urgencyClasses(level: number | null) {
  if (level === 5) return "border-red-600 bg-red-100 text-red-900";
  if (level === 4) return "border-rose-500 bg-rose-100 text-rose-900";
  if (level === 3) return "border-orange-500 bg-orange-100 text-orange-900";
  if (level === 2) return "border-amber-500 bg-amber-100 text-amber-900";
  if (level === 1) return "border-yellow-500 bg-yellow-100 text-yellow-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function principalPhone(card: OperativeWizardCard) {
  return card.telefonos.find((item) => item.principal)?.num ?? card.telefonos[0]?.num ?? "-";
}

function formatUrgentClock(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO");
}

function getOperativeGroupKey(card: OperativeWizardCard, groupBy: string): { key: string; label: string } {
  switch (groupBy) {
    case "provincia":
      return { key: card.provincia || "SIN_PROVINCIA", label: card.provincia || "Sin Provincia" };
    case "zona":
      return { key: card.zona || "SIN_ZONA", label: card.zona || "Sin Zona" };
    case "status":
      return { key: card.status || "SIN_ESTADO", label: statusLabel(card.status || "Sin Estado") };
    case "canalContacto":
      return {
        key: card.canalContacto || "NO_ESPECIFICADO",
        label:
          card.canalContacto === "WHATSAPP"
            ? "WhatsApp"
            : card.canalContacto === "LLAMADA_DIRECTA"
              ? "Llamada Directa"
              : "Sin Canal Específico",
      };
    case "mensajero":
      return { key: card.mensajero || "SIN_ASIGNAR", label: card.mensajero || "Sin Asignar" };
    case "urgent":
      return card.urgent ? { key: "URGENTE", label: "Casos Urgentes" } : { key: "NORMAL", label: "Normales" };
    case "gestion":
      if (card.solicitudRetorno) return { key: "RETORNO", label: "Solicitud de Retorno" };
      if (card.traslado && Object.keys(card.traslado).length > 0) return { key: "TRASLADO", label: "Traslado / Cambio de Provincia" };
      if (card.contactado) return { key: "CONTACTADA", label: "Contactada Exitosamente" };
      if (card.hasAttempt) return { key: "NO_CONTACTADA", label: "No Contactada (Intentos)" };
      return { key: "PENDIENTE", label: "Por Llamar (Sin Gestión)" };
    default: {
      const val = (card as unknown as Record<string, unknown>)[groupBy];
      if (val !== undefined && val !== null) {
        return { key: String(val), label: String(val) };
      }
      return { key: "ALL", label: "General" };
    }
  }
}

export default function OperativoClient() {
  const [cards, setCards] = useState<OperativeWizardCard[]>([]);
  const [tab, setTab] = usePersistentState<OperativeTab>("operativo:tab", "activos");
  const [filters, setFilters] = useState<Record<string, string>>(() => ({
    page: "1",
    pageSize: "25",
    days: "3",
  }));
  const [viewMode, setViewMode] = useState<ViewType>("list");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [selectedCardId, setSelectedCardId] = usePersistentState<string | null>(
    "operativo:selected-card",
    null,
  );
  const [showReport, setShowReport] = usePersistentState("operativo:report-modal", false);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [message, setMessage] = useState("");
  const [provinciasList, setProvinciasList] = useState<string[]>([]);
  const [urgentNotifications, setUrgentNotifications] = useState<UrgentNotification[]>([]);

  // Load registered provinces
  useEffect(() => {
    fetch("/api/config/provincias", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.provincias) {
          setProvinciasList(data.provincias.map((p: { nombre: string }) => p.nombre).sort());
        }
      })
      .catch(() => {});
  }, []);

  async function pullUrgentNotifications() {
    const res = await fetch("/api/operativo/urgencias", { cache: "no-store" });
    const json = await res.json().catch(() => ({ notifications: [] }));
    if (!res.ok) return;
    const notifications = (json.notifications ?? []) as UrgentNotification[];
    if (!notifications.length) return;
    setUrgentNotifications(notifications);
  }

  async function loadCards(keepSelectedId?: string, currentFilters = filters) {
    if (tab === "extensiones-sla") {
      setLoading(false);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("page", currentFilters.page || "1");
    params.set("pageSize", currentFilters.pageSize || "25");
    if (currentFilters.days) params.set("days", currentFilters.days);

    Object.entries(currentFilters).forEach(([k, v]) => {
      if (v && v !== "ALL" && k !== "page" && k !== "pageSize" && k !== "days" && k !== "groupBy") {
        params.set(k, v);
      }
    });

    const res = await fetch(`/api/operativo/contacto?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as OperativoResponse;
    const nextCards = json.cards ?? [];
    const meta = json.pagination;
    setCards(nextCards);
    if (meta) {
      setPagination(meta);
    }

    if (keepSelectedId) {
      const keepIndex = nextCards.findIndex((item) => item.id === keepSelectedId);
      setSelectedCardId(keepIndex >= 0 ? keepSelectedId : null);
    }

    setLoading(false);
  }

  useEffect(() => {
    setFilters((prev) => ({ ...prev, page: "1" }));
  }, [tab]);

  useEffect(() => {
    void loadCards(undefined, filters);
  }, [tab, filters]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await pullUrgentNotifications();
    };
    void run();
    const timer = setInterval(() => {
      void run();
    }, 60_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const groupedCards = useMemo(() => {
    if (!filters.groupBy) return null;
    const groups: Record<string, { groupKey: string; groupLabel: string; items: OperativeWizardCard[] }> = {};
    for (const card of cards) {
      const { key, label } = getOperativeGroupKey(card, filters.groupBy);
      if (!groups[key]) {
        groups[key] = { groupKey: key, groupLabel: label, items: [] };
      }
      groups[key].items.push(card);
    }
    return Object.values(groups);
  }, [cards, filters.groupBy]);

  const selectedIndex = selectedCardId ? cards.findIndex((card) => card.id === selectedCardId) : -1;
  const current = selectedIndex >= 0 ? cards[selectedIndex] : undefined;

  async function saveContact(payload: {
    telefonos: PhoneState[];
    comentario: string;
    contactado: boolean;
    canalContacto?: "WHATSAPP" | "LLAMADA_DIRECTA" | null;
    nuevaDireccion?: string | null;
    fechaPreferenciaEntrega?: string | null;
    solicitudRetorno?: boolean;
    motivoRetorno?: string | null;
    trasladoProvincia?: string | null;
    trasladoMotivo?: string | null;
  }) {
    if (!current || !current.cardId) {
      return "No se puede guardar: tarjeta sin vínculo en la base de datos.";
    }

    const res = await fetch("/api/operativo/contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: current.cardId,
        ...payload,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return data.error ?? "No se pudo registrar contacto";
    }

    // Refresh cards and keep state
    await loadCards(current.id, filters);
    return null;
  }

  async function exportContacts(format: ExportFormat, provinciaFilter?: string) {
    const params = new URLSearchParams({ type: "contactos", format });
    if (provinciaFilter && provinciaFilter !== "ALL") {
      params.set("provincia", provinciaFilter);
    }

    const res = await fetch(`/api/reportes/export?${params.toString()}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Error en exportación" }));
      setMessage(json.error ?? "No se pudo exportar el reporte.");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-contactos-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Reporte descargado en formato ${format.toUpperCase()}`);
  }

  async function exportDailyZip(date: string) {
    const res = await fetch(`/api/operativo/contacto/reportes?date=${date}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Error en descarga diaria" }));
      setMessage(json.error ?? "No se pudo generar el ZIP operativo");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operativo-${date}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`ZIP operativo generado para ${date}`);
  }

  const renderCardItem = (card: OperativeWizardCard, mode: ViewType) => {
    if (mode === "cards") {
      return (
        <div
          key={card.id}
          onClick={() => setSelectedCardId(card.id)}
          className={`group cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md flex flex-col justify-between ${
            card.contactado
              ? "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70"
              : card.solicitudRetorno
                ? "border-rose-200 bg-rose-50/40 hover:bg-rose-50/70"
                : card.traslado && Object.keys(card.traslado).length > 0
                  ? "border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/70"
                  : tab === "urgentes" && card.urgentLevel
                    ? urgencyClasses(card.urgentLevel)
                    : "border-slate-200 bg-white hover:border-blue-300"
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {card.tc}
              </span>
              <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${statusClasses(card.status)}`}>
                {statusLabel(card.status)}
              </span>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                {card.nombre}
              </h4>
              <p className="text-xs text-slate-500">Cédula: {card.cedula}</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {card.provincia} ({card.zona})
                {principalPhone(card) !== "-" ? ` · Tel: ${principalPhone(card)}` : ""}
              </p>
            </div>

            {card.contactado ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="h-3 w-3" /> Contactada {card.canalContacto ? `(${card.canalContacto})` : ""}
              </span>
            ) : card.solicitudRetorno ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                <RotateCcw className="h-3 w-3" /> Retorno Solicitado
              </span>
            ) : card.traslado && Object.keys(card.traslado).length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                <Send className="h-3 w-3" /> Traslado Solicitado
              </span>
            ) : null}

            {card.nuevaDireccion ? (
              <p className="text-xs text-emerald-800 font-medium bg-emerald-50/70 rounded p-1.5 line-clamp-2">
                📍 {card.nuevaDireccion}
              </p>
            ) : null}

            {card.fechaPreferenciaEntrega ? (
              <p className="text-xs text-blue-800 font-medium bg-blue-50/70 rounded px-1.5 py-0.5">
                📅 Entrega: {new Date(card.fechaPreferenciaEntrega).toLocaleDateString("es-DO")}
              </p>
            ) : null}

            {card.comentarioContacto ? (
              <p className="text-xs italic text-slate-600 line-clamp-2">&quot;{card.comentarioContacto}&quot;</p>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
            {card.remaining !== null && card.remaining !== undefined ? (
              <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                SLA: {card.remaining}d
              </span>
            ) : <span />}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCardId(card.id);
              }}
              className="rounded-lg bg-[#0f2544] px-3 py-1 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs"
            >
              Abrir Wizard
            </button>
          </div>
        </div>
      );
    }

    // Default List Mode
    return (
      <div
        key={card.id}
        onClick={() => setSelectedCardId(card.id)}
        className={`group cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md ${
          card.contactado
            ? "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70"
            : card.solicitudRetorno
              ? "border-rose-200 bg-rose-50/40 hover:bg-rose-50/70"
              : card.traslado && Object.keys(card.traslado).length > 0
                ? "border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/70"
                : tab === "urgentes" && card.urgentLevel
                  ? urgencyClasses(card.urgentLevel)
                  : "border-slate-200 bg-white hover:border-blue-300"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-base font-bold text-slate-900 group-hover:text-blue-700">
                {card.nombre}
              </span>
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {card.tc}
              </span>
              {card.contactado ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Contactada
                </span>
              ) : card.solicitudRetorno ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                  <RotateCcw className="h-3 w-3" /> Retorno Solicitado
                </span>
              ) : card.traslado && Object.keys(card.traslado).length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                  <Send className="h-3 w-3" /> Traslado Solicitado
                </span>
              ) : null}
              {card.canalContacto ? (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  Canal: {card.canalContacto === "WHATSAPP" ? "WhatsApp" : "Llamada Directa"}
                </span>
              ) : null}
              {card.urgent && card.urgentLevel ? (
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-bold ${urgencyClasses(card.urgentLevel)}`}
                >
                  {card.urgentLabel ?? `Nivel ${card.urgentLevel}`}
                </span>
              ) : null}
            </div>

            <p className="text-xs text-slate-500">
              Cédula: <strong className="text-slate-700">{card.cedula}</strong> ·{" "}
              {card.provincia} ({card.zona})
              {principalPhone(card) !== "-" ? ` · Tel: ${principalPhone(card)}` : ""}
              {card.mensajero ? ` · Mensajero: ${card.mensajero}` : ""}
            </p>

            {card.nuevaDireccion ? (
              <p className="text-xs text-emerald-800 font-medium bg-emerald-50/70 rounded px-2 py-0.5 inline-block">
                📍 Dirección confirmada: {card.nuevaDireccion}
              </p>
            ) : null}

            {card.fechaPreferenciaEntrega ? (
              <p className="text-xs text-blue-800 font-medium bg-blue-50/70 rounded px-2 py-0.5 inline-block">
                📅 Entrega acordada para: {new Date(card.fechaPreferenciaEntrega).toLocaleDateString("es-DO")}
              </p>
            ) : null}

            {card.motivoRetorno ? (
              <p className="text-xs text-rose-800 font-medium bg-rose-50/70 rounded px-2 py-0.5 inline-block">
                ⚠ Motivo retorno: {card.motivoRetorno}
              </p>
            ) : null}

            {card.traslado && typeof card.traslado === "object" && (card.traslado as Record<string, unknown>).provinciaDestino ? (
              <p className="text-xs text-indigo-800 font-medium bg-indigo-50/70 rounded px-2 py-0.5 inline-block">
                ✈ Destino traslado: {String((card.traslado as Record<string, unknown>).provinciaDestino)}
              </p>
            ) : null}

            {card.comentarioContacto ? (
              <p className="text-xs italic text-slate-600">&quot;{card.comentarioContacto}&quot;</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span className={`rounded-xl border px-2.5 py-1 text-xs font-bold ${statusClasses(card.status)}`}>
              {statusLabel(card.status)}
            </span>
            {card.remaining !== null && card.remaining !== undefined ? (
              <span className="rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-700">
                SLA: {card.remaining}d
              </span>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCardId(card.id);
              }}
              className="rounded-xl bg-[#0f2544] px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-xs"
            >
              Abrir Wizard
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operativo de Llamadas & Agilizaciones"
        subtitle={`${pagination.total} tarjetas registradas en esta vista`}
      />

      <Panel>
        {/* TAB BUTTONS BAR */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTab("activos")}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                tab === "activos"
                  ? "border-blue-700 bg-blue-50 text-blue-700 shadow-2xs"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Phone className="h-3.5 w-3.5" />
              Tarjetas Activas (Por llamar)
            </button>

            <button
              onClick={() => setTab("contactadas")}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                tab === "contactadas"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-2xs"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Contactadas
            </button>

            <button
              onClick={() => setTab("no-contactadas")}
              className={`flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-xs font-bold transition-all ${
                tab === "no-contactadas"
                  ? "border-amber-500 bg-amber-100 text-amber-800 shadow-2xs"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              No Contactadas (Intentos)
            </button>

            <button
              onClick={() => setTab("urgentes")}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                tab === "urgentes"
                  ? "border-rose-600 bg-rose-50 text-rose-700 shadow-2xs"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Casos Urgentes
            </button>

            <button
              onClick={() => setTab("traslados")}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                tab === "traslados"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-2xs"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              Traslados (Cambio Prov.)
            </button>

            <button
              onClick={() => setTab("retorno")}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                tab === "retorno"
                  ? "border-red-600 bg-red-50 text-red-700 shadow-2xs"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Solicitudes de Retorno
            </button>

            <button
              onClick={() => setTab("extensiones-sla")}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                tab === "extensiones-sla"
                  ? "border-[#0f2544] bg-[#0f2544] text-white shadow-2xs"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Extensiones SLA (Banco)
            </button>
          </div>

          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs"
          >
            Reporte de Contactos
          </button>
        </div>
      </Panel>

      {/* FILTERBAR: BUSCADOR, FACETAS Y AGRUPACIONES (ODOO STYLE) */}
      {tab !== "extensiones-sla" ? (
        <FilterBar
          resource="operativo"
          sectionKey="operativo"
          filters={filters}
          onFilterChange={(next) => setFilters({ ...next, page: "1", pageSize: filters.pageSize || "25" })}
          onReset={() => setFilters({ page: "1", pageSize: "25", days: "3" })}
          searchPlaceholder="Buscar por TC, cédula, nombre o referencia..."
          allowedViews={["list", "cards"]}
          currentView={viewMode}
          onViewChange={setViewMode}
          facets={[
            {
              field: "provincia",
              label: "Provincia",
              multi: true,
              options: provinciasList.map((p) => ({ label: p, value: p })),
            },
            {
              field: "zona",
              label: "Zona",
              multi: true,
              options: [
                { label: "Metro", value: "Metro" },
                { label: "Norte", value: "Norte" },
                { label: "Sur", value: "Sur" },
                { label: "Este", value: "Este" },
              ],
            },
            {
              field: "status",
              label: "Estado",
              multi: true,
              options: STATUS_OPTIONS.filter((o) => o.value !== "ALL").map((o) => ({
                label: o.label,
                value: o.value,
              })),
            },
            {
              field: "canalContacto",
              label: "Canal de Contacto",
              options: [
                { label: "WhatsApp", value: "WHATSAPP" },
                { label: "Llamada Directa", value: "LLAMADA_DIRECTA" },
              ],
            },
            {
              field: "gestion",
              label: "Estado de Contacto",
              options: [
                { label: "Contactadas", value: "contactadas" },
                { label: "No Contactadas (Intentos)", value: "no-contactadas" },
                { label: "Traslado (Cambio Prov.)", value: "traslados" },
                { label: "Retorno Solicitado", value: "retorno" },
              ],
            },
            {
              field: "urgent",
              label: "Urgente",
              options: [{ label: "Solo casos urgentes", value: "1" }],
            },
            ...(tab === "activos"
              ? [
                  {
                    field: "days",
                    label: "Días SLA",
                    options: [
                      { label: "SLA <= 1 día", value: "1" },
                      { label: "SLA <= 2 días", value: "2" },
                      { label: "SLA <= 3 días", value: "3" },
                      { label: "SLA <= 5 días", value: "5" },
                    ],
                  },
                ]
              : []),
          ]}
          groupByOptions={[
            { field: "provincia", label: "Provincia" },
            { field: "zona", label: "Zona" },
            { field: "status", label: "Estado" },
            { field: "canalContacto", label: "Canal de Contacto" },
            { field: "mensajero", label: "Mensajero" },
            { field: "gestion", label: "Estado de Gestión" },
          ]}
        />
      ) : null}

      {/* URGENT NOTIFICATIONS PANEL */}
      {urgentNotifications.length ? (
        <Panel title="Alertas Urgentes de Operativo">
          <div className="space-y-2">
            {urgentNotifications.map((item) => (
              <div
                key={`${item.urgentCaseId}-${item.nextNotificationAt}`}
                className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs flex justify-between items-center"
              >
                <div>
                  <p className="font-bold text-rose-900">
                    {item.label} - {item.cliente} ({item.tc})
                  </p>
                  <p className="text-rose-800">
                    {item.provincia} - Próxima alerta: {formatUrgentClock(item.nextNotificationAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCardId(item.cardId)}
                  className="rounded-lg bg-rose-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-800"
                >
                  Abrir Wizard
                </button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* MAIN VIEW CONTENT */}
      {tab === "extensiones-sla" ? (
        <SLAExtensionRequestsTable isAdmin={true} />
      ) : (
        <Panel
          title={
            tab === "activos"
              ? "Cola de Clientes Activos (Por Llamar)"
              : tab === "contactadas"
                ? "Tarjetas Contactadas Exitosamente"
                : tab === "urgentes"
                  ? "Casos Urgentes"
                  : tab === "no-contactadas"
                    ? "Tarjetas No Contactadas (Intentos Realizados)"
                    : tab === "traslados"
                      ? "Tarjetas con Solicitud de Traslado"
                      : "Solicitudes de Retorno al Banco"
          }
        >
          {groupedCards ? (
            /* GROUPED ACCORDION VIEW */
            <div className="space-y-4">
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
                          {group.items.length} {group.items.length === 1 ? "tarjeta" : "tarjetas"}
                        </span>
                      </div>
                    </div>

                    {!isCollapsed ? (
                      viewMode === "cards" ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {group.items.map((card) => renderCardItem(card, "cards"))}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {group.items.map((card) => renderCardItem(card, "list"))}
                        </div>
                      )
                    ) : null}
                  </div>
                );
              })}
              {!groupedCards.length && !loading ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  No hay tarjetas con esos filtros.
                </p>
              ) : null}
            </div>
          ) : viewMode === "cards" ? (
            /* UNGROUPED CARDS VIEW */
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((card) => renderCardItem(card, "cards"))}
              {!cards.length && !loading ? (
                <p className="col-span-full py-12 text-center text-sm text-slate-500">
                  No hay tarjetas con esos filtros.
                </p>
              ) : null}
            </div>
          ) : (
            /* UNGROUPED LIST VIEW */
            <div className="space-y-2.5">
              {cards.map((card) => renderCardItem(card, "list"))}
              {!cards.length && !loading ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  No hay tarjetas con esos filtros.
                </p>
              ) : null}
            </div>
          )}

          {/* PAGINATOR */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs text-slate-600 bg-white">
            <span>
              Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> ·{" "}
              <strong>{pagination.total}</strong> registros
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.max(1, (Number(prev.page) || 1) - 1)) }))}
                disabled={(Number(filters.page) || 1) <= 1}
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.min(pagination.totalPages, (Number(prev.page) || 1) + 1)) }))}
                disabled={(Number(filters.page) || 1) >= pagination.totalPages}
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </Panel>
      )}

      {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}

      {/* 3-COLUMN FULL-SCREEN WIZARD MODAL */}
      {selectedIndex >= 0 && current ? (
        <OperativeContactWizard
          card={current}
          index={selectedIndex}
          total={cards.length}
          provincesList={provinciasList}
          onClose={() => setSelectedCardId(null)}
          onPrev={() => setSelectedCardId(cards[Math.max(selectedIndex - 1, 0)]?.id ?? null)}
          onNext={() =>
            setSelectedCardId(cards[Math.min(selectedIndex + 1, cards.length - 1)]?.id ?? null)
          }
          onSave={saveContact}
        />
      ) : null}

      {/* REPORT MODAL */}
      {showReport ? (
        <ContactReportModal
          data={cards}
          onClose={() => setShowReport(false)}
          onExport={exportContacts}
          onExportDailyZip={exportDailyZip}
        />
      ) : null}
    </div>
  );
}

function ContactReportModal({
  data,
  onClose,
  onExport,
  onExportDailyZip,
}: {
  data: OperativeWizardCard[];
  onClose: () => void;
  onExport: (format: ExportFormat, provincia?: string) => Promise<void>;
  onExportDailyZip: (date: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const contactadas = data.filter((item) => item.contactado);
  const pendientes = data.filter((item) => !item.contactado);

  const groupedByProvince = useMemo(() => {
    const grouped = new Map<string, OperativeWizardCard[]>();
    data.forEach((item) => {
      const key = item.provincia || item.zona || "SIN PROVINCIA";
      const rows = grouped.get(key) ?? [];
      rows.push(item);
      grouped.set(key, rows);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function handleExport(format: ExportFormat, provincia?: string) {
    setBusy(true);
    await onExport(format, provincia);
    setBusy(false);
  }

  async function handleDailyZip() {
    setBusy(true);
    await onExportDailyZip(reportDate);
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <h3 className="font-display text-lg font-bold text-slate-900">Reporte de Contactos</h3>
          <button
            onClick={onClose}
            className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-sm font-semibold text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total en Lista" value={data.length} color="text-slate-900" />
            <StatCard label="Contactadas" value={contactadas.length} color="text-emerald-700" />
            <StatCard label="Pendientes / No Contactadas" value={pendientes.length} color="text-rose-700" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Cliente / TC</th>
                  <th className="px-3 py-2.5">Tel. Principal</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-center">Contactado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-slate-900">{item.nombre}</p>
                      <p className="font-mono text-[11px] text-slate-500">{item.tc}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700">{principalPhone(item)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${statusClasses(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {item.contactado ? (
                        <span className="font-bold text-emerald-600">✓ Sí</span>
                      ) : (
                        <span className="text-slate-400">○ No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* EXPORTS POR PROVINCIA */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">
              Exportar reporte por provincia
            </p>
            <div className="space-y-2">
              {groupedByProvince.map(([prov, rows]) => (
                <div
                  key={prov}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900">{prov}</span>
                    <span className="ml-2 font-medium text-slate-500">({rows.length} tarjetas)</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleExport("xlsx", prov)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-bold text-slate-700 hover:bg-slate-100"
                    >
                      Excel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleExport("pdf", prov)}
                      className="rounded-lg bg-[#0f2544] px-3 py-1 font-bold text-white hover:bg-slate-800"
                    >
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* REPORTE DIARIO ZIP */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-900">
              Reporte General Operativo por Día (ZIP)
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs text-slate-800"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleDailyZip}
                className="rounded-xl bg-blue-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
              >
                Generar ZIP Operativo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-center">
      <p className={`font-display text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
    </div>
  );
}
