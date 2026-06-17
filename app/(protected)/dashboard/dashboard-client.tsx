"use client";

import { useEffect, useRef, useState } from "react";
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
  urgentes: [],
  slaAlerts: [],
  recentActivity: [],
  contactadasPendientes: [],
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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen operativo de tarjetas despachadas en el rango seleccionado"
      />

      {notificationIssue ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {notificationIssue}
        </div>
      ) : null}

      <Panel className="mb-5" title="Rango de fechas">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-600">
            Desde
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadSummary(from, to)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            Actualizar
          </button>
          {data.range ? (
            <p className="text-xs text-slate-500">
              Mostrando despacho del {data.range.from} al {data.range.to}
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel className="mb-5" title="Estados del rango">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.statusBreakdown.map((row) => (
            <article key={row.status} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2">
                <StatusBadge value={row.status} />
              </div>
              <p className="font-display text-2xl font-bold text-slate-900">{row.count}</p>
            </article>
          ))}
          {!data.statusBreakdown.length ? (
            <p className="text-sm text-slate-500">{loading ? "Cargando..." : "Sin estados para ese rango."}</p>
          ) : null}
        </div>
      </Panel>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="En Posesion" value={data.metrics.enPosesion} color="bg-blue-50 text-blue-700" />
        <MetricCard label="En Ruta" value={data.metrics.enRuta} color="bg-amber-50 text-amber-700" />
        <MetricCard label="Entregadas" value={data.metrics.entregadas} color="bg-lime-50 text-lime-700" />
        <MetricCard label="Urgentes" value={data.metrics.urgentes} color="bg-red-50 text-red-700" />
        <MetricCard label="Retornadas" value={data.metrics.retornadas} color="bg-emerald-50 text-emerald-700" />
      </div>

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

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Tarjetas urgentes" subtitle="Casos marcados como prioridad">
          <div className="space-y-2">
            {data.urgentes.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedCardId(row.cardId)}
                className={`w-full rounded-xl border p-3 text-left transition hover:opacity-95 ${urgencyBadge(row.level)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{row.customer.nombre}</p>
                    <p className="text-xs">
                      {row.customer.cedula} - TC {row.tc}
                    </p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${urgencyBadge(row.level)}`}>
                    {row.levelLabel}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <p className="font-semibold uppercase tracking-wide opacity-70">Provincia</p>
                    <p>{row.provincia || "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide opacity-70">Proxima alerta</p>
                    <p>{dateClock(row.nextNotificationAt)}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide opacity-70">Estado</p>
                    <div className="mt-1">
                      <StatusBadge value={row.status} />
                    </div>
                  </div>
                </div>
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
          <div className="space-y-2">
            {data.slaAlerts.map((alert) => (
              <div
                key={alert.id}
                className="cursor-pointer rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                onClick={() => setSelectedCardId(alert.id)}
              >
                <p className="text-sm font-semibold text-slate-900">{alert.cliente}</p>
                <p className="text-xs text-slate-500">{alert.cedula} - TC {alert.tc}</p>
                <div className="mt-2 flex items-center justify-between">
                  <StatusBadge value={alert.status} />
                  <span className="text-xs font-semibold text-red-600">{alert.remaining} dias</span>
                </div>
              </div>
            ))}
            {!data.slaAlerts.length ? (
              <p className="text-sm text-slate-500">No hay alertas SLA inmediatas.</p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-5"
        title="Contactadas pendientes"
        subtitle="Tarjetas contactadas en operativo que aun no estan entregadas"
      >
        <div className="space-y-2">
          {data.contactadasPendientes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedCardId(item.id)}
              className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{item.customer.nombre}</p>
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

      <Panel className="mt-5" title="Actividad reciente">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Fecha</th>
                <th className="pb-2">Tarjeta</th>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {data.recentActivity.map((activity) => (
                <tr
                  key={activity.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => setSelectedCardId(activity.card.id)}
                >
                  <td className="py-2">{new Date(activity.createdAt).toLocaleString("es-DO")}</td>
                  <td className="py-2">{activity.card.tc}</td>
                  <td className="py-2">{activity.card.customer.nombre}</td>
                  <td className="py-2">
                    <StatusBadge value={activity.toStatus} />
                  </td>
                  <td className="py-2">{activity.byUser?.name ?? "Sistema"}</td>
                </tr>
              ))}
              {!data.recentActivity.length ? (
                <tr>
                  <td colSpan={5} className="py-4 text-sm text-slate-500">
                    Sin actividad registrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-display text-3xl font-bold text-slate-900">{value}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{label}</span>
      </div>
    </article>
  );
}
