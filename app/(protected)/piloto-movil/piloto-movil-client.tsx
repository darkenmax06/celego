"use client";

import { useCallback, useDeferredValue, useEffect, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  RadioTower,
  RefreshCw,
  Smartphone,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type ChecklistStatus = "OK" | "WARN" | "BLOCKED";

type PilotPayload = {
  generatedAt: string;
  filters: {
    from: string;
    to: string;
    messengerId: string | null;
    province: string | null;
    staleDeviceHours: number;
  };
  summary: {
    readinessScore: number;
    activeDevices: number;
    pendingDevices: number;
    lostDevices: number;
    revokedDevices: number;
    staleDevices: number;
    openAssignments: number;
    uploadedEvidence: number;
    decryptedEvidence: number;
    openIncidents: number;
    criticalIncidents: number;
    deadLetterJobs: number;
  };
  breakdowns: {
    devices: Record<string, number>;
    assignments: Record<string, number>;
    assignmentsByProvince: Array<{ province: string; count: number }>;
    evidences: Record<string, number>;
    evidenceKinds: Record<string, number>;
    incidents: Record<string, number>;
    incidentSeverity: Record<string, number>;
    syncJobs: Record<string, number>;
    syncKinds: Record<string, number>;
  };
  checklist: Array<{
    id: string;
    label: string;
    status: ChecklistStatus;
    detail: string;
  }>;
  devices: Array<{
    id: string;
    deviceId: string;
    label: string | null;
    status: string;
    platform: string;
    messenger: {
      id: string;
      name: string;
      province: string | null;
      zone: string | null;
    } | null;
    lastSeenAt: string | null;
    updatedAt: string;
    counts: {
      secureEvidences: number;
      mobileIncidents: number;
    };
  }>;
  incidents: Array<{
    id: string;
    incidentId: string;
    severity: string;
    status: string;
    type: string;
    title: string;
    deviceId: string;
    messenger: {
      id: string;
      name: string;
      province: string | null;
      zone: string | null;
    } | null;
    reportedAt: string;
  }>;
  messengers: Array<{
    id: string;
    name: string;
    province: string | null;
    zone: string | null;
  }>;
};

const CHECKLIST_STYLE: Record<ChecklistStatus, string> = {
  OK: "border-emerald-200 bg-emerald-50 text-emerald-700",
  WARN: "border-amber-200 bg-amber-50 text-amber-700",
  BLOCKED: "border-rose-200 bg-rose-50 text-rose-700",
};

const STATUS_DOT: Record<ChecklistStatus, React.ComponentType<{ className?: string }>> = {
  OK: CheckCircle2,
  WARN: AlertTriangle,
  BLOCKED: XCircle,
};

function formatDateTime(value: string | null) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function metricTone(value: number, warning = false) {
  if (warning && value > 0) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-white text-slate-950";
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  className,
}: {
  label: string;
  value: number | string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <span className="rounded-xl bg-slate-900/5 p-2 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function ChecklistRow({
  item,
}: {
  item: PilotPayload["checklist"][number];
}) {
  const Icon = STATUS_DOT[item.status];
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <span className={cn("rounded-full border p-1.5", CHECKLIST_STYLE[item.status])}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">{item.label}</p>
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", CHECKLIST_STYLE[item.status])}>
            {item.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
      </div>
    </li>
  );
}

function BreakdownList({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  const entries = Object.entries(values).filter(([, count]) => count > 0);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <div className="space-y-2">
        {entries.map(([key, count]) => (
          <div key={key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-700">{key}</span>
            <span className="font-semibold text-slate-950">{count}</span>
          </div>
        ))}
        {!entries.length ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Sin actividad en la ventana.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function PilotoMovilClient() {
  const [data, setData] = useState<PilotPayload | null>(null);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    messengerId: "",
    province: "",
  });
  const deferredProvince = useDeferredValue(filters.province);
  const [isPending, startTransition] = useTransition();

  const loadPilot = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.messengerId) params.set("messengerId", filters.messengerId);
    if (deferredProvince.trim()) params.set("province", deferredProvince.trim());

    const response = await fetch(`/api/admin/mobile-pilot?${params.toString()}`, {
      cache: "no-store",
    });
    const json = (await response.json()) as PilotPayload & { error?: string };
    if (!response.ok) throw new Error(json.error ?? "No se pudo cargar el piloto movil");
    setData(json);
    setMessage("");
  }, [deferredProvince, filters.from, filters.messengerId, filters.to]);

  useEffect(() => {
    startTransition(() => {
      void loadPilot().catch((error) => {
        setMessage(error instanceof Error ? error.message : "No se pudo cargar el piloto movil");
      });
    });
  }, [loadPilot]);

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Piloto movil"
        subtitle="Centro de control para validar seguridad, sincronizacion y preparacion operativa antes de salir a campo con evidencias cifradas."
        actions={
          <button
            type="button"
            onClick={() => void loadPilot()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", isPending ? "animate-spin" : "")} />
            Refrescar
          </button>
        }
      />

      <Panel className="mb-5 border-[#173f67]/20 bg-gradient-to-br from-[#102944] to-[#173f67] text-white">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Torre de control
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              {summary ? `${summary.readinessScore}% listo para simulacion` : "Cargando piloto"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
              El piloto no declara produccion: confirma que no hay acceso cruzado, que los
              dispositivos laten, que la cola no se atasca y que las evidencias siguen cifradas.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Bloqueos</p>
              <p className="mt-3 text-3xl font-bold">{summary?.criticalIncidents ?? 0}</p>
              <p className="text-sm text-slate-300">HIGH/CRITICAL</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Cola rota</p>
              <p className="mt-3 text-3xl font-bold">{summary?.deadLetterJobs ?? 0}</p>
              <p className="text-sm text-slate-300">dead letters</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Sin latido</p>
              <p className="mt-3 text-3xl font-bold">{summary?.staleDevices ?? 0}</p>
              <p className="text-sm text-slate-300">{data?.filters.staleDeviceHours ?? 24}h</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="mb-5">
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            Desde
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-[#173f67] focus:bg-white"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Hasta
            <input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-[#173f67] focus:bg-white"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Mensajero
            <select
              value={filters.messengerId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, messengerId: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-[#173f67] focus:bg-white"
            >
              <option value="">Todos</option>
              {data?.messengers.map((messenger) => (
                <option key={messenger.id} value={messenger.id}>
                  {messenger.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Provincia
            <input
              value={filters.province}
              onChange={(event) => setFilters((current) => ({ ...current, province: event.target.value }))}
              placeholder="Ej. Santo Domingo"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-[#173f67] focus:bg-white"
            />
          </label>
        </div>
        {message ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {message}
          </p>
        ) : null}
        {data ? (
          <p className="mt-4 text-xs text-slate-500">
            Generado: {formatDateTime(data.generatedAt)}. Ventana: {formatDateTime(data.filters.from)} a {formatDateTime(data.filters.to)}.
          </p>
        ) : null}
      </Panel>

      <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Dispositivos activos"
          value={summary?.activeDevices ?? 0}
          helper={`${summary?.pendingDevices ?? 0} pendientes por activar`}
          icon={Smartphone}
          className={metricTone(summary?.pendingDevices ?? 0, true)}
        />
        <MetricCard
          label="Tarjetas abiertas"
          value={summary?.openAssignments ?? 0}
          helper="Cartera movil automatica"
          icon={ClipboardCheck}
          className={metricTone(0)}
        />
        <MetricCard
          label="Evidencias relay"
          value={summary?.uploadedEvidence ?? 0}
          helper={`${summary?.decryptedEvidence ?? 0} descifradas en core`}
          icon={RadioTower}
          className={metricTone(0)}
        />
        <MetricCard
          label="Incidencias abiertas"
          value={summary?.openIncidents ?? 0}
          helper={`${summary?.criticalIncidents ?? 0} criticas o altas`}
          icon={AlertTriangle}
          className={metricTone(summary?.criticalIncidents ?? 0, true)}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Checklist diario" subtitle="Semaforo de salida para piloto interno.">
          <ul className="space-y-3">
            {data?.checklist.map((item) => <ChecklistRow key={item.id} item={item} />)}
            {!data ? (
              <li className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Cargando checklist...
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel title="Pulso de sincronizacion" subtitle="Actividad tecnica agregada, sin datos sensibles.">
          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownList title="Evidencias" values={data?.breakdowns.evidences ?? {}} />
            <BreakdownList title="Cola sync" values={data?.breakdowns.syncJobs ?? {}} />
            <BreakdownList title="Incidencias" values={data?.breakdowns.incidents ?? {}} />
            <BreakdownList title="Tarjetas abiertas" values={data?.breakdowns.assignments ?? {}} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Dispositivos observados" subtitle="Ultimos equipos relevantes para el piloto.">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Dispositivo</th>
                  <th className="px-4 py-3">Mensajero</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Latido</th>
                  <th className="px-4 py-3 text-right">Actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.devices.map((device) => (
                  <tr key={device.id} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{device.deviceId}</p>
                      <p className="text-xs text-slate-500">{device.label ?? device.platform}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {device.messenger?.name ?? "Sin mensajero"}
                      <p className="text-xs text-slate-400">
                        {device.messenger?.province ?? "Provincia sin definir"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        {device.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <Clock3 className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                      {formatDateTime(device.lastSeenAt)}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-600">
                      <p>{device.counts.secureEvidences} evidencias</p>
                      <p>{device.counts.mobileIncidents} incidencias</p>
                    </td>
                  </tr>
                ))}
                {data && !data.devices.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                      No hay dispositivos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Incidencias recientes" subtitle="Solo metadatos operativos, sin descripcion sensible.">
          <div className="space-y-3">
            {data?.incidents.map((incident) => (
              <article key={incident.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{incident.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {incident.incidentId} - {incident.deviceId}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                    {incident.severity}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" />
                    {incident.status}
                  </span>
                  <span>{incident.type}</span>
                  <span>{formatDateTime(incident.reportedAt)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {incident.messenger?.name ?? "Mensajero sin asignar"}
                </p>
              </article>
            ))}
            {data && !data.incidents.length ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                Sin incidencias en la ventana seleccionada.
              </p>
            ) : null}
            {!data ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Cargando incidencias...
              </p>
            ) : null}
          </div>
        </Panel>
      </section>
    </div>
  );
}
