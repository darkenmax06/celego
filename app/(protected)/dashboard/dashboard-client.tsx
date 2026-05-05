"use client";

import { useEffect, useState } from "react";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

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
    tc: string;
    provincia: string;
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

export default function DashboardClient() {
  const defaults = monthDefaults();
  const [data, setData] = useState<DashboardPayload>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen operativo de tarjetas despachadas en el rango seleccionado"
      />

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

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Tarjetas urgentes" subtitle="Casos marcados como prioridad">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">TC</th>
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2">Provincia</th>
                </tr>
              </thead>
              <tbody>
                {data.urgentes.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setSelectedCardId(row.id)}
                  >
                    <td className="py-2 font-medium">{row.tc}</td>
                    <td className="py-2">{row.customer.nombre}</td>
                    <td className="py-2">{row.provincia}</td>
                  </tr>
                ))}
                {!data.urgentes.length ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-sm text-slate-500">
                      {loading ? "Cargando..." : "Sin urgentes activos"}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
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
