"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { MobileDeviceStatus } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type DeviceStatus = keyof typeof MobileDeviceStatus;

type MessengerOption = {
  id: string;
  nombre: string;
  zonaPrincipal: string | null;
  provinciaTrabajo: string | null;
};

type FleetDevice = {
  id: string;
  deviceId: string;
  label: string | null;
  platform: string;
  status: DeviceStatus;
  messengerId: string | null;
  messenger: (MessengerOption & { activo: boolean }) | null;
  certificateFingerprint: string | null;
  publicKeyRegistered: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts: {
    mobilePackages: number;
    secureEvidences: number;
    mobileIncidents: number;
  };
  lastPackage: {
    packageId: string;
    status: string;
    deliveryDate: string;
    expiresAt: string;
    downloadedAt: string | null;
  } | null;
};

type FleetPayload = {
  devices: FleetDevice[];
  messengers: MessengerOption[];
  summary: Record<DeviceStatus, number>;
};

const STATUS_ORDER: DeviceStatus[] = ["PENDING", "ACTIVE", "LOST", "REVOKED"];
const STATUS_LABEL: Record<DeviceStatus, string> = {
  PENDING: "Pendientes",
  ACTIVE: "Activos",
  LOST: "Perdidos",
  REVOKED: "Revocados",
};
const STATUS_BADGE: Record<DeviceStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  LOST: "border-rose-200 bg-rose-50 text-rose-700",
  REVOKED: "border-slate-300 bg-slate-100 text-slate-600",
};
const DEFAULT_SUMMARY: Record<DeviceStatus, number> = {
  PENDING: 0,
  ACTIVE: 0,
  LOST: 0,
  REVOKED: 0,
};

function formatDateTime(value: string | null) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortKey(value: string | null) {
  if (!value) return "No registrada";
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export default function FlotaClient() {
  const [devices, setDevices] = useState<FleetDevice[]>([]);
  const [messengers, setMessengers] = useState<MessengerOption[]>([]);
  const [summary, setSummary] = useState<Record<DeviceStatus, number>>(DEFAULT_SUMMARY);
  const [status, setStatus] = useState<DeviceStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadFleet = useCallback(async () => {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (query.trim()) params.set("q", query.trim());

    const res = await fetch(`/api/admin/mobile-devices?${params.toString()}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as FleetPayload & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la flota");

    setDevices(json.devices ?? []);
    setMessengers(json.messengers ?? []);
    setSummary(json.summary ?? DEFAULT_SUMMARY);
  }, [query, status]);

  useEffect(() => {
    startTransition(() => {
      void loadFleet().catch((error) => {
        setMessage(error instanceof Error ? error.message : "No se pudo cargar la flota");
      });
    });
  }, [loadFleet]);

  const pendingDevices = useMemo(
    () => devices.filter((device) => device.status === "PENDING"),
    [devices],
  );

  async function updateDevice(
    device: FleetDevice,
    payload: Partial<Pick<FleetDevice, "label" | "messengerId" | "status">>,
  ) {
    setBusyId(device.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/mobile-devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: device.id, ...payload }),
      });
      const json = (await res.json()) as { device?: FleetDevice; error?: string };
      if (!res.ok) throw new Error(json.error ?? "No se pudo actualizar el dispositivo");

      setMessage(`Dispositivo ${device.deviceId} actualizado.`);
      await loadFleet();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el dispositivo");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Flota móvil"
        subtitle="Aprobación y control de dispositivos que pueden descargar rutas, cifrar evidencias y sincronizar contra Celego local."
        actions={
          <button
            type="button"
            onClick={() => void loadFleet()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Refrescar
          </button>
        }
      />

      <section className="mb-5 grid gap-3 md:grid-cols-4">
        {STATUS_ORDER.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            className={cn(
              "rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
              status === item ? "border-[#173f67]" : "border-slate-200",
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {STATUS_LABEL[item]}
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-950">{summary[item] ?? 0}</p>
          </button>
        ))}
      </section>

      <Panel className="mb-5 border-[#d9cdbb] bg-[#fffaf0]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Cola de aprobacion
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {pendingDevices.length} dispositivo(s) esperando activacion
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Cuando el mensajero toca registrar/latido, la solicitud llega a este Celego local y queda aqui como PENDING.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStatus("PENDING")}
            className="rounded-xl bg-[#173f67] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2c49]"
          >
            Ver pendientes
          </button>
        </div>
      </Panel>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatus("ALL")}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                status === "ALL"
                  ? "border-[#173f67] bg-[#173f67] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              Todos
            </button>
            {STATUS_ORDER.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  status === item
                    ? "border-[#173f67] bg-[#173f67] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {STATUS_LABEL[item]}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar device ID, mensajero, etiqueta..."
            className="min-w-[280px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-[#173f67] focus:bg-white"
          />
        </div>

        {message ? (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {message}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Dispositivo</th>
                <th className="px-4 py-3">Mensajero</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Ultimo latido</th>
                <th className="px-4 py-3">Actividad</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {devices.map((device) => {
                const disabled = busyId === device.id || isPending;
                return (
                  <tr key={device.id} className="align-top transition hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{device.deviceId}</p>
                      <p className="text-xs text-slate-500">{device.label ?? "Sin etiqueta"} · {device.platform}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Llave: {device.publicKeyRegistered ? "registrada" : "pendiente"} · Cert: {shortKey(device.certificateFingerprint)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={device.messengerId ?? ""}
                        disabled={disabled}
                        onChange={(event) =>
                          void updateDevice(device, {
                            messengerId: event.target.value || null,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#173f67]"
                      >
                        <option value="">Sin mensajero</option>
                        {messengers.map((messenger) => (
                          <option key={messenger.id} value={messenger.id}>
                            {messenger.nombre}
                          </option>
                        ))}
                      </select>
                      {device.messenger ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {device.messenger.provinciaTrabajo ?? "Provincia sin definir"}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", STATUS_BADGE[device.status])}>
                        {device.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDateTime(device.lastSeenAt)}
                      <p className="mt-1 text-xs text-slate-400">Alta: {formatDateTime(device.createdAt)}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <p>{device.counts.mobilePackages} paquete(s)</p>
                      <p>{device.counts.secureEvidences} evidencia(s)</p>
                      <p>{device.counts.mobileIncidents} incidencia(s)</p>
                      {device.lastPackage ? (
                        <p className="mt-1 text-xs text-slate-400">Ultimo: {device.lastPackage.packageId}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        {device.status !== "ACTIVE" ? (
                          <button
                            type="button"
                            disabled={disabled || !device.messengerId}
                            onClick={() => void updateDevice(device, { status: "ACTIVE" })}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            Activar
                          </button>
                        ) : null}
                        {device.status !== "LOST" ? (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void updateDevice(device, { status: "LOST" })}
                            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Perdido
                          </button>
                        ) : null}
                        {device.status !== "REVOKED" ? (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void updateDevice(device, { status: "REVOKED" })}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Revocar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!devices.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    No hay dispositivos con los filtros seleccionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
