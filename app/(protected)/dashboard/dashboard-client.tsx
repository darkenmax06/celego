"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { notificationFailureMessage, notifyInBrowser } from "@/lib/browser-notifications";
import { usePersistentState } from "@/lib/use-persistent-state";

type DashboardPayload = {
  range?: { from: string; to: string };
  statusBreakdown: Array<{ status: string; count: number }>;
  metrics: {
    enPosesion: number;
    enRuta: number;
    entregadas: number;
    urgentes: number;
    retornadas: number;
  };
  zoneBreakdown: Array<{ zona: string; count: number }>;
  urgentes: Array<{
    id: string;
    cardId: string;
    tc: string;
    provincia: string;
    status: string;
    level: number;
    levelLabel: string;
    intervalMinutes: number;
    nextNotificationAt: string | null;
    lastNotifiedAt: string | null;
    customer: { nombre: string; cedula: string };
  }>;
  slaAlerts: Array<{
    id: string;
    tc: string;
    status: string;
    cliente: string;
    cedula: string;
    remaining: number;
  }>;
  recentActivity: Array<{
    id: string;
    toStatus: string;
    createdAt: string;
    card: { id: string; tc: string; customer: { nombre: string } };
    byUser: { name: string } | null;
  }>;
  contactadasPendientes: Array<{
    id: string;
    tc: string;
    status: string;
    provincia: string;
    zona: string;
    customer: { nombre: string; cedula: string };
  }>;
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

const emptyData: DashboardPayload = {
  range: undefined,
  statusBreakdown: [],
  metrics: { enPosesion: 0, enRuta: 0, entregadas: 0, urgentes: 0, retornadas: 0 },
  zoneBreakdown: [],
  urgentes: [],
  slaAlerts: [],
  recentActivity: [],
  contactadasPendientes: [],
};

const METRIC_STYLES = {
  enPosesion: {
    label: "En Posesión",
    bar: "bg-blue-500",
    text: "text-blue-700",
    chip: "bg-blue-50",
    query: { status: "DESPACHADA,ENVIADA_INTERIOR" },
  },
  enRuta: {
    label: "En Ruta",
    bar: "bg-amber-500",
    text: "text-amber-700",
    chip: "bg-amber-50",
    query: { status: "EN_RUTA" },
  },
  entregadas: {
    label: "Entregadas",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    chip: "bg-emerald-50",
    query: { status: "ENTREGADA,ENTREGA_DIGITAL" },
  },
  urgentes: {
    label: "Urgentes",
    bar: "bg-rose-500",
    text: "text-rose-700",
    chip: "bg-rose-50",
    query: { urgent: "1" },
  },
  retornadas: {
    label: "Retornadas",
    bar: "bg-violet-500",
    text: "text-violet-700",
    chip: "bg-violet-50",
    query: { status: "RETORNADA" },
  },
} as const;

const ZONE_BAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-sky-500", "bg-rose-500"];

const ACTIVITY_DOT_COLORS: Record<string, string> = {
  DESPACHADA: "bg-indigo-500",
  ENVIADA_INTERIOR: "bg-violet-500",
  EN_RUTA: "bg-sky-500",
  ENTREGADA: "bg-emerald-500",
  ENTREGA_DIGITAL: "bg-fuchsia-500",
  ACUSE_RECIBIDO: "bg-emerald-500",
  RETORNADA: "bg-rose-500",
  DEVUELTA_TIENDA: "bg-rose-500",
  NO_LOCALIZADO: "bg-orange-500",
};

function monthDefaults() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

function urgencyBadge(level: number) {
  if (level >= 5) return "border-red-600 bg-red-100 text-red-900";
  if (level === 4) return "border-rose-500 bg-rose-100 text-rose-900";
  if (level === 3) return "border-orange-500 bg-orange-100 text-orange-900";
  if (level === 2) return "border-amber-500 bg-amber-100 text-amber-900";
  return "border-yellow-500 bg-yellow-100 text-yellow-900";
}

function dateClock(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO");
}

export default function DashboardClient() {
  const router = useRouter();
  const defaults = monthDefaults();
  const [data, setData] = useState<DashboardPayload>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = usePersistentState<string | null>(
    "dashboard:selected-card",
    null,
  );
  const [from, setFrom] = usePersistentState("dashboard:from", defaults.from);
  const [to, setTo] = usePersistentState("dashboard:to", defaults.to);
  const [urgentNotifications, setUrgentNotifications] = useState<UrgentNotification[]>([]);
  const [notificationIssue, setNotificationIssue] = useState("");
  const seenNotificationKeys = useRef(new Set<string>());

  async function loadSummary(fromDate = from, toDate = to) {
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    const res = await fetch(`/api/dashboard/summary?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as DashboardPayload;
    setData(json);
    setLoading(false);
  }

  useEffect(() => {
    void loadSummary(from, to);
  }, [from, to]);

  useEffect(() => {
    let mounted = true;
    const pullNotifications = async () => {
      const res = await fetch("/api/operativo/urgencias", { cache: "no-store" });
      const json = await res.json().catch(() => ({ notifications: [] }));
      if (!mounted || !res.ok) return;
      const notifications = (json.notifications ?? []) as UrgentNotification[];
      if (notifications.length) {
        setUrgentNotifications(notifications);
        for (const notification of notifications) {
          const key = `${notification.urgentCaseId}-${notification.nextNotificationAt}`;
          if (seenNotificationKeys.current.has(key)) continue;
          seenNotificationKeys.current.add(key);
          const result = await notifyInBrowser({
            title: `Recordatorio urgente: ${notification.label}`,
            body: `${notification.cliente} - TC ${notification.tc} (${notification.provincia})`,
            tag: `urgent-reminder-${notification.urgentCaseId}`,
            requireInteraction: true,
          });
          const warning = notificationFailureMessage(result);
          if (warning) {
            setNotificationIssue(warning);
          } else if (result.shown) {
            setNotificationIssue("");
          }
        }
      }
    };

    void pullNotifications();
    const timer = setInterval(() => {
      void pullNotifications();
    }, 60_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const rangeTotal = data.statusBreakdown.reduce((sum, row) => sum + row.count, 0) || 1;
  const zoneTotal = data.zoneBreakdown.reduce((sum, row) => sum + row.count, 0) || 1;

  function goToTarjetas(extra: Record<string, string>) {
    const params = new URLSearchParams({ from, to, ...extra });
    router.push(`/tarjetas?${params.toString()}`);
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen operativo de tarjetas despachadas en el rango seleccionado"
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-500">
              Desde
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Hasta
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadSummary(from, to)}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Actualizar
            </button>
          </div>
        }
      />

      {notificationIssue ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {notificationIssue}
        </div>
      ) : null}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          {...METRIC_STYLES.enPosesion}
          value={data.metrics.enPosesion}
          pct={(data.metrics.enPosesion / rangeTotal) * 100}
          onClick={() => goToTarjetas(METRIC_STYLES.enPosesion.query)}
        />
        <MetricCard
          {...METRIC_STYLES.enRuta}
          value={data.metrics.enRuta}
          pct={(data.metrics.enRuta / rangeTotal) * 100}
          onClick={() => goToTarjetas(METRIC_STYLES.enRuta.query)}
        />
        <MetricCard
          {...METRIC_STYLES.entregadas}
          value={data.metrics.entregadas}
          pct={(data.metrics.entregadas / rangeTotal) * 100}
          onClick={() => goToTarjetas(METRIC_STYLES.entregadas.query)}
        />
        <MetricCard
          {...METRIC_STYLES.urgentes}
          value={data.metrics.urgentes}
          pct={(data.metrics.urgentes / rangeTotal) * 100}
          onClick={() => goToTarjetas(METRIC_STYLES.urgentes.query)}
        />
        <MetricCard
          {...METRIC_STYLES.retornadas}
          value={data.metrics.retornadas}
          pct={(data.metrics.retornadas / rangeTotal) * 100}
          onClick={() => goToTarjetas(METRIC_STYLES.retornadas.query)}
        />
      </div>

      <Panel
        className="mb-5"
        title="Estados del rango"
        subtitle={data.range ? `Despacho del ${data.range.from} al ${data.range.to}` : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {data.statusBreakdown.map((row) => (
            <button
              key={row.status}
              type="button"
              onClick={() => goToTarjetas({ status: row.status })}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1 pr-2.5 pl-1 transition hover:border-slate-300 hover:bg-slate-100"
            >
              <StatusBadge value={row.status} />
              <span className="font-display text-sm font-bold text-slate-700">{row.count}</span>
            </button>
          ))}
          {!data.statusBreakdown.length ? (
            <p className="text-sm text-slate-500">{loading ? "Cargando..." : "Sin estados para ese rango."}</p>
          ) : null}
        </div>
      </Panel>

      {urgentNotifications.length ? (
        <Panel className="mb-5" title="Recordatorios de urgencia">
          <div className="space-y-2">
            {urgentNotifications.map((item) => (
              <button
                key={`${item.urgentCaseId}-${item.nextNotificationAt}`}
                type="button"
                onClick={() => setSelectedCardId(item.cardId)}
                className={`w-full rounded-xl border px-3 py-2 text-left ${urgencyBadge(item.level)}`}
              >
                <p className="text-sm font-semibold">
                  {item.label} - {item.cliente} ({item.tc})
                </p>
                <p className="text-xs">
                  {item.provincia} - proxima alerta: {dateClock(item.nextNotificationAt)}
                </p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUrgentNotifications([])}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            >
              Limpiar recordatorios
            </button>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-5">
          <Panel title="Tarjetas urgentes" subtitle="Casos marcados como prioridad">
            <div className="space-y-2">
              {data.urgentes.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedCardId(row.cardId)}
                  className={`w-full rounded-xl border p-3 text-left transition hover:opacity-95 ${urgencyBadge(row.level)}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{row.customer.nombre}</p>
                      <p className="text-xs opacity-80">
                        {row.customer.cedula} · TC {row.tc} · {row.provincia || "Sin provincia"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge value={row.status} />
                      <span className="rounded-md border px-2 py-1 text-xs font-semibold whitespace-nowrap">
                        {row.levelLabel}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs opacity-70">Proxima alerta: {dateClock(row.nextNotificationAt)}</p>
                </button>
              ))}
              {!data.urgentes.length ? (
                <p className="py-4 text-sm text-slate-500">
                  {loading ? "Cargando..." : "Sin urgentes activos"}
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel title="Alertas SLA" subtitle="Tarjetas con 3 dias o menos para vencer">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 pr-0 text-right font-medium">Dias</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slaAlerts.map((alert) => (
                    <tr
                      key={alert.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => setSelectedCardId(alert.id)}
                    >
                      <td className="py-2.5">
                        <p className="font-medium text-slate-900">{alert.cliente}</p>
                        <p className="text-xs text-slate-500">{alert.cedula} · TC {alert.tc}</p>
                      </td>
                      <td className="py-2.5">
                        <StatusBadge value={alert.status} />
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-bold ${
                            alert.remaining <= 1
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {alert.remaining}d
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!data.slaAlerts.length ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-sm text-slate-500">
                        No hay alertas SLA inmediatas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Tarjetas por zona" subtitle="Distribución de tarjetas activas">
            <div className="flex flex-col gap-3">
              {data.zoneBreakdown.map((zone, index) => (
                <button
                  key={zone.zona}
                  type="button"
                  onClick={() => goToTarjetas({ zona: zone.zona })}
                  className="flex flex-col gap-1 rounded-lg p-1 text-left transition hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{zone.zona}</span>
                    <span className="font-display font-bold text-slate-900">{zone.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${ZONE_BAR_COLORS[index % ZONE_BAR_COLORS.length]}`}
                      style={{ width: `${(zone.count / zoneTotal) * 100}%` }}
                    />
                  </div>
                </button>
              ))}
              {!data.zoneBreakdown.length ? (
                <p className="text-sm text-slate-500">{loading ? "Cargando..." : "Sin datos de zona."}</p>
              ) : null}
            </div>
          </Panel>

          <Panel title="Actividad reciente">
            <div className="flex flex-col">
              {data.recentActivity.map((activity, index) => (
                <button
                  key={activity.id}
                  type="button"
                  onClick={() => setSelectedCardId(activity.card.id)}
                  className={`flex items-start gap-3 py-2.5 text-left hover:bg-slate-50 ${
                    index !== 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      ACTIVITY_DOT_COLORS[activity.toStatus] ?? "bg-slate-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {activity.card.customer.nombre}
                      </p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {new Date(activity.createdAt).toLocaleTimeString("es-DO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      TC {activity.card.tc} → {activity.toStatus.replaceAll("_", " ")} ·{" "}
                      {activity.byUser?.name ?? "Sistema"}
                    </p>
                  </div>
                </button>
              ))}
              {!data.recentActivity.length ? (
                <p className="py-4 text-sm text-slate-500">Sin actividad registrada.</p>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        className="mt-5"
        title="Contactadas pendientes"
        subtitle="Tarjetas contactadas en operativo que aun no estan entregadas"
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.contactadasPendientes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedCardId(item.id)}
              className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">{item.customer.nombre}</p>
                <StatusBadge value={item.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.customer.cedula} - TC {item.tc} - {item.provincia || item.zona}
              </p>
            </button>
          ))}
          {!data.contactadasPendientes.length ? (
            <p className="text-sm text-slate-500">No hay tarjetas contactadas pendientes.</p>
          ) : null}
        </div>
      </Panel>

      {selectedCardId ? (
        <CardDetailModal
          cardId={selectedCardId}
          onClose={() => setSelectedCardId(null)}
          onUpdated={() => {
            void loadSummary(from, to);
          }}
        />
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  pct,
  bar,
  text,
  chip,
  onClick,
}: {
  label: string;
  value: number;
  pct: number;
  bar: string;
  text: string;
  chip: string;
  onClick?: () => void;
}) {
  const clampedPct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${chip} ${text}`}>
          {clampedPct.toFixed(0)}%
        </span>
      </div>
      <p className={`font-display mt-2 text-3xl font-bold ${text}`}>{value.toLocaleString("es-DO")}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${clampedPct}%` }} />
      </div>
    </button>
  );
}
