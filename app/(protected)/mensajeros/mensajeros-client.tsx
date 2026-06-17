"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessengerServiceType } from "@prisma/client";
import { formatCurrencyDOP, toCents } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { usePersistentState } from "@/lib/use-persistent-state";

type Messenger = {
  id: string;
  nombre: string;
  telefono: string | null;
  zonaPrincipal: string | null;
  provinciaTrabajo: string | null;
  activo: boolean;
  serviceRates: Array<{
    id: string;
    serviceType: MessengerServiceType;
    amountCents: number;
  }>;
};

type DailyRecord = {
  id: string;
  fecha: string;
  messengerId: string;
  totalCents: number;
  entregasNormales: number;
  entregasRemotas: number;
  recogidasBanco: number;
  mandados: number;
};

type MessengerReport = {
  id: string;
  messengerId: string;
  fromDate: string;
  toDate: string;
  totalCents: number;
  generatedAt: string;
  anulada?: boolean;
};

type Counts = {
  NORMAL: number;
  REMOTA: number;
  RECOGIDA: number;
  MANDADO: number;
};

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type ProvinceRow = { id: string; nombre: string; zona: string; active: boolean };

const ZONES = ["Metro", "Este", "Norte", "Sur"] as const;
const SERVICE_ORDER: MessengerServiceType[] = ["NORMAL", "REMOTA", "RECOGIDA", "MANDADO"];
const SERVICE_LABEL: Record<MessengerServiceType, string> = {
  NORMAL: "Entrega Normal",
  REMOTA: "Zona Remota",
  RECOGIDA: "Recogida a Banco",
  MANDADO: "Mandado",
};
const ZERO_COUNTS: Counts = { NORMAL: 0, REMOTA: 0, RECOGIDA: 0, MANDADO: 0 };

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function countsFromRecord(record?: DailyRecord | null): Counts {
  if (!record) return { ...ZERO_COUNTS };
  return {
    NORMAL: record.entregasNormales,
    REMOTA: record.entregasRemotas,
    RECOGIDA: record.recogidasBanco,
    MANDADO: record.mandados,
  };
}

function rateMap(rates: Messenger["serviceRates"]) {
  const map: Record<MessengerServiceType, number> = {
    NORMAL: 0,
    REMOTA: 0,
    RECOGIDA: 0,
    MANDADO: 0,
  };
  rates.forEach((rate) => {
    map[rate.serviceType] = rate.amountCents;
  });
  return map;
}

function calcTotalCents(counts: Counts, rates: Record<MessengerServiceType, number>) {
  return (
    counts.NORMAL * rates.NORMAL +
    counts.REMOTA * rates.REMOTA +
    counts.RECOGIDA * rates.RECOGIDA +
    counts.MANDADO * rates.MANDADO
  );
}

function recordSignature(date: string, counts: Counts) {
  return `${date}|${counts.NORMAL}|${counts.REMOTA}|${counts.RECOGIDA}|${counts.MANDADO}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((chunk) => chunk[0])
    .join("")
    .toUpperCase();
}

export default function MensajerosClient() {
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [messengerPagination, setMessengerPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 24,
    total: 0,
    totalPages: 1,
  });
  const [messengerPage, setMessengerPage] = usePersistentState("mensajeros:page", 1);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [reports, setReports] = useState<MessengerReport[]>([]);
  const [globalDate, setGlobalDate] = usePersistentState(
    "mensajeros:daily-date",
    new Date().toISOString().slice(0, 10),
  );
  const [globalReportFrom, setGlobalReportFrom] = usePersistentState(
    "mensajeros:report-from",
    new Date().toISOString().slice(0, 10),
  );
  const [globalReportTo, setGlobalReportTo] = usePersistentState(
    "mensajeros:report-to",
    new Date().toISOString().slice(0, 10),
  );
  const [globalCounts, setGlobalCounts] = useState<Record<string, Counts>>({});
  const [selectedMessengerId, setSelectedMessengerId] = usePersistentState<string | null>(
    "mensajeros:selected",
    null,
  );
  const [showNew, setShowNew] = usePersistentState("mensajeros:new-modal", false);
  const [message, setMessage] = useState("");
  const [busyGlobalSaveById, setBusyGlobalSaveById] = useState<Record<string, boolean>>({});
  const [busyGlobalZip, setBusyGlobalZip] = useState(false);
  const globalAutoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  async function loadMessengers(pageArg = messengerPage) {
    const params = new URLSearchParams({
      page: String(pageArg),
      pageSize: String(messengerPagination.pageSize),
      onlyActive: "1",
    });
    const messengerRes = await fetch(`/api/mensajeros?${params.toString()}`, { cache: "no-store" });
    const messengerJson = await messengerRes.json();
    setMessengers(messengerJson.messengers ?? []);
    if (messengerJson.pagination) {
      setMessengerPagination(messengerJson.pagination as PaginationMeta);
      if (pageArg > messengerJson.pagination.totalPages) {
        setMessengerPage(messengerJson.pagination.totalPages);
      }
    }
  }

  async function loadActivity() {
    const dailyRes = await fetch("/api/mensajeros/gestion-diaria", { cache: "no-store" });
    const dailyJson = await dailyRes.json();

    setRecords(dailyJson.records ?? []);
    setReports(dailyJson.reports ?? []);
  }

  async function loadProvinces() {
    const res = await fetch("/api/config/provincias", { cache: "no-store" });
    const json = await res.json();
    const list = (json.provincias ?? [])
      .filter((item: ProvinceRow) => item.active)
      .map((item: ProvinceRow) => item.nombre);
    setProvinces(list);
  }

  useEffect(() => {
    void loadActivity();
  }, []);

  useEffect(() => {
    void loadProvinces();
  }, []);

  useEffect(() => {
    void loadMessengers(messengerPage);
  }, [messengerPage]);

  useEffect(() => {
    const next: Record<string, Counts> = {};
    messengers.forEach((messenger) => {
      const sameDay = records.find(
        (record) => record.messengerId === messenger.id && dateKey(record.fecha) === globalDate,
      );
      next[messenger.id] = countsFromRecord(sameDay);
    });
    setGlobalCounts(next);
  }, [globalDate, messengers, records]);

  const selectedMessenger = useMemo(
    () => messengers.find((item) => item.id === selectedMessengerId) ?? null,
    [messengers, selectedMessengerId],
  );

  useEffect(() => {
    return () => {
      Object.values(globalAutoSaveTimers.current).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
    };
  }, []);

  function setGlobalRowBusy(messengerId: string, busy: boolean) {
    setBusyGlobalSaveById((prev) => {
      if (busy) {
        return { ...prev, [messengerId]: true };
      }

      if (!prev[messengerId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[messengerId];
      return next;
    });
  }

  async function saveGlobalRow(
    messenger: Messenger,
    countsOverride?: Counts,
    silent = false,
    dateOverride?: string,
  ) {
    const counts = countsOverride ?? globalCounts[messenger.id] ?? { ...ZERO_COUNTS };
    const fecha = dateOverride ?? globalDate;
    setGlobalRowBusy(messenger.id, true);

    const res = await fetch("/api/mensajeros/gestion-diaria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "record",
        messengerId: messenger.id,
        fecha,
        entregasNormales: counts.NORMAL,
        entregasRemotas: counts.REMOTA,
        recogidasBanco: counts.RECOGIDA,
        mandados: counts.MANDADO,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo guardar registro global");
      setGlobalRowBusy(messenger.id, false);
      return;
    }

    setGlobalRowBusy(messenger.id, false);
    if (!silent) {
      setMessage(`Registro diario guardado para ${messenger.nombre}`);
    }
    await loadActivity();
  }

  function queueGlobalRowAutoSave(messenger: Messenger, nextCounts: Counts, dateValue: string) {
    const currentTimer = globalAutoSaveTimers.current[messenger.id];
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    globalAutoSaveTimers.current[messenger.id] = setTimeout(() => {
      void saveGlobalRow(messenger, nextCounts, true, dateValue);
    }, 800);
  }

  async function downloadGlobalReportsZip() {
    if (!globalReportFrom || !globalReportTo) {
      setMessage("Selecciona el rango para generar el ZIP");
      return;
    }

    setBusyGlobalZip(true);
    const params = new URLSearchParams({
      mode: "all",
      from: globalReportFrom,
      to: globalReportTo,
    });

    const res = await fetch(`/api/mensajeros/reportes?${params.toString()}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo generar ZIP general" }));
      setMessage(json.error ?? "No se pudo generar ZIP general");
      setBusyGlobalZip(false);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reportes-mensajeros-${globalReportFrom}-${globalReportTo}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setBusyGlobalZip(false);
    setMessage("ZIP general generado");
  }

  return (
    <div>
      <PageHeader title="Mensajeros" subtitle="Nomina, registro diario y reportes por mensajero" />

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Perfiles de mensajeros</p>
            <p className="text-xs text-slate-500">{messengerPagination.total} mensajeros activos</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white"
          >
            + Nuevo mensajero
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {messengers.map((messenger) => {
            const messengerRecords = records.filter((record) => record.messengerId === messenger.id);
            const latest = messengerRecords[0];
            const totalCents = messengerRecords.reduce((sum, record) => sum + record.totalCents, 0);
            const todayCounts = countsFromRecord(latest);

            return (
              <article key={messenger.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">
                    {initials(messenger.nombre)}
                  </div>
                  <div className="flex-1">
                    <p className="font-display text-base font-bold text-slate-900">{messenger.nombre}</p>
                    <p className="text-xs text-slate-500">{messenger.telefono ?? "-"}</p>
                    <p className="text-xs text-slate-500">{messenger.provinciaTrabajo ?? "Sin provincia asignada"}</p>
                  </div>
                  <button
                    onClick={() => setSelectedMessengerId(messenger.id)}
                    className="rounded-lg bg-[#0f2544] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Ver perfil
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Entregas hoy" value={todayCounts.NORMAL} />
                  <MiniStat label="Total periodo" value={formatCurrencyDOP(totalCents)} />
                  <MiniStat label="Tipos" value={messenger.serviceRates.length} />
                </div>
              </article>
            );
          })}
          {!messengers.length ? <p className="text-sm text-slate-500">No hay mensajeros registrados.</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span>
            Pagina {messengerPagination.page} de {messengerPagination.totalPages} · {messengerPagination.total} registros
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMessengerPage((prev) => Math.max(1, prev - 1))}
              disabled={messengerPage <= 1}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setMessengerPage((prev) => Math.min(messengerPagination.totalPages, prev + 1))}
              disabled={messengerPage >= messengerPagination.totalPages}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </Panel>

      <Panel className="mt-5" title="Registro global del dia">
        <div className="mb-3 flex items-center gap-2">
          <input
            type="date"
            value={globalDate}
            onChange={(event) => setGlobalDate(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Mensajero</th>
                <th className="px-3 py-2 text-center">Normales</th>
                <th className="px-3 py-2 text-center">Remotas</th>
                <th className="px-3 py-2 text-center">Recogidas</th>
                <th className="px-3 py-2 text-center">Mandados</th>
                <th className="px-3 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {messengers.map((messenger) => {
                const counts = globalCounts[messenger.id] ?? { ...ZERO_COUNTS };
                const rates = rateMap(messenger.serviceRates);
                const total = calcTotalCents(counts, rates);
                const rowSaving = Boolean(busyGlobalSaveById[messenger.id]);

                return (
                  <tr key={messenger.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{messenger.nombre}</td>
                    {SERVICE_ORDER.map((service) => (
                      <td key={service} className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          value={counts[service]}
                          disabled={rowSaving}
                          onChange={(event) => {
                            const nextCounts = {
                              ...counts,
                              [service]: Number(event.target.value || 0),
                            };
                            setGlobalCounts((prev) => ({
                              ...prev,
                              [messenger.id]: nextCounts,
                            }));
                            queueGlobalRowAutoSave(messenger, nextCounts, globalDate);
                          }}
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <p className="font-semibold text-emerald-700">{formatCurrencyDOP(total)}</p>
                      {rowSaving ? <p className="text-[11px] text-slate-500">Guardando...</p> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="mt-5" title="Reportes de mensajeros (imagenes)">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Desde</p>
            <input
              type="date"
              value={globalReportFrom}
              onChange={(event) => setGlobalReportFrom(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Hasta</p>
            <input
              type="date"
              value={globalReportTo}
              onChange={(event) => setGlobalReportTo(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => void downloadGlobalReportsZip()}
            disabled={busyGlobalZip}
            className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busyGlobalZip ? "Generando..." : "Generar ZIP general"}
          </button>
        </div>
      </Panel>

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

      {showNew ? (
        <NewMessengerModal
          provinces={provinces}
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            setMessage("Mensajero creado");
            await Promise.all([loadMessengers(messengerPage), loadActivity()]);
          }}
        />
      ) : null}

      {selectedMessenger ? (
        <MessengerModal
          messenger={selectedMessenger}
          provinces={provinces}
          records={records.filter((item) => item.messengerId === selectedMessenger.id)}
          reports={reports.filter((item) => item.messengerId === selectedMessenger.id)}
          onClose={() => setSelectedMessengerId(null)}
          onUpdated={async (nextMessage) => {
            if (nextMessage) {
              setMessage(nextMessage);
            }
            await Promise.all([loadMessengers(messengerPage), loadActivity()]);
          }}
        />
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <p className="font-display text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function NewMessengerModal({
  provinces,
  onClose,
  onCreated,
}: {
  provinces: string[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [zona, setZona] = useState("Metro");
  const [provinciaTrabajo, setProvinciaTrabajo] = useState("");
  const [rates, setRates] = useState<Counts>({ NORMAL: 0, REMOTA: 0, RECOGIDA: 0, MANDADO: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!provinciaTrabajo && provinces.length) {
      setProvinciaTrabajo(provinces[0]);
    }
  }, [provinciaTrabajo, provinces]);

  async function create() {
    setSaving(true);
    setError("");

    const res = await fetch("/api/mensajeros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        telefono: telefono || undefined,
        zonaPrincipal: zona,
        provinciaTrabajo: provinciaTrabajo || undefined,
        rates: SERVICE_ORDER.map((service) => ({
          serviceType: service,
          amountCents: toCents(rates[service]),
        })),
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "No se pudo crear mensajero");
      setSaving(false);
      return;
    }

    setSaving(false);
    await onCreated();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h3 className="font-display text-xl font-bold text-slate-900">Nuevo mensajero</h3>
        <div className="mt-4 space-y-3">
          <input
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Nombre"
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <input
            value={telefono}
            onChange={(event) => setTelefono(event.target.value)}
            placeholder="Telefono"
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <select
            value={zona}
            onChange={(event) => setZona(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          >
            {ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <select
            value={provinciaTrabajo}
            onChange={(event) => setProvinciaTrabajo(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          >
            {!provinces.length ? <option value="">Sin provincias configuradas</option> : null}
            {provinces.map((province) => (
              <option key={province} value={province}>
                Provincia de trabajo: {province}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            {SERVICE_ORDER.map((service) => (
              <label key={service} className="text-xs text-slate-600">
                {SERVICE_LABEL[service]}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={rates[service]}
                  onChange={(event) =>
                    setRates((prev) => ({ ...prev, [service]: Number(event.target.value || 0) }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            ))}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => void create()}
            disabled={saving || !nombre.trim()}
            className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessengerModal({
  messenger,
  provinces,
  records,
  reports,
  onClose,
  onUpdated,
}: {
  messenger: Messenger;
  provinces: string[];
  records: DailyRecord[];
  reports: MessengerReport[];
  onClose: () => void;
  onUpdated: (message: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"perfil" | "registro" | "reporte" | "historial">("perfil");
  const [telefono, setTelefono] = useState(messenger.telefono ?? "");
  const [zona, setZona] = useState(messenger.zonaPrincipal ?? "Metro");
  const [provinciaTrabajo, setProvinciaTrabajo] = useState(messenger.provinciaTrabajo ?? "");
  const [rates, setRates] = useState(() => {
    const map = rateMap(messenger.serviceRates);
    return {
      NORMAL: map.NORMAL / 100,
      REMOTA: map.REMOTA / 100,
      RECOGIDA: map.RECOGIDA / 100,
      MANDADO: map.MANDADO / 100,
    };
  });

  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [recordCounts, setRecordCounts] = useState<Counts>({ ...ZERO_COUNTS });
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [feedback, setFeedback] = useState("");
  const skipRecordAutoSave = useRef(true);
  const recordAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecordSignature = useRef("");

  useEffect(() => {
    skipRecordAutoSave.current = true;
    const existing = records.find((record) => dateKey(record.fecha) === recordDate);
    const nextCounts = countsFromRecord(existing);
    setRecordCounts(nextCounts);
    lastRecordSignature.current = recordSignature(recordDate, nextCounts);
  }, [recordDate, records]);

  useEffect(() => {
    if (!provinciaTrabajo && provinces.length) {
      setProvinciaTrabajo(provinces[0]);
    }
  }, [provinciaTrabajo, provinces]);

  const previewRecords = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    return records.filter((record) => {
      const date = new Date(record.fecha);
      return date >= start && date <= end;
    });
  }, [from, to, records]);

  const previewTotal = useMemo(
    () => previewRecords.reduce((sum, record) => sum + record.totalCents, 0),
    [previewRecords],
  );

  async function saveProfile() {
    setBusy(true);
    setFeedback("");

    const res = await fetch("/api/mensajeros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: messenger.id,
        nombre: messenger.nombre,
        telefono: telefono || undefined,
        zonaPrincipal: zona || undefined,
        provinciaTrabajo: provinciaTrabajo || undefined,
        activo: messenger.activo,
        rates: SERVICE_ORDER.map((service) => ({
          serviceType: service,
          amountCents: toCents(rates[service]),
        })),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedback(json.error ?? "No se pudo guardar perfil");
      setBusy(false);
      return;
    }

    setBusy(false);
    setFeedback("Perfil actualizado");
    await onUpdated("Perfil de mensajero actualizado");
  }

  const saveDailyRecord = useCallback(async (silent = false) => {
    const currentSignature = recordSignature(recordDate, recordCounts);
    if (silent && currentSignature === lastRecordSignature.current) {
      return;
    }
    if (silent) {
      setSavingRecord(true);
    } else {
      setBusy(true);
      setFeedback("");
    }

    const res = await fetch("/api/mensajeros/gestion-diaria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "record",
        messengerId: messenger.id,
        fecha: recordDate,
        entregasNormales: recordCounts.NORMAL,
        entregasRemotas: recordCounts.REMOTA,
        recogidasBanco: recordCounts.RECOGIDA,
        mandados: recordCounts.MANDADO,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedback(json.error ?? "No se pudo guardar registro");
      if (silent) {
        setSavingRecord(false);
      } else {
        setBusy(false);
      }
      return;
    }

    lastRecordSignature.current = currentSignature;
    if (silent) {
      setSavingRecord(false);
    } else {
      setBusy(false);
    }
    setFeedback(silent ? "Cambios guardados automaticamente" : "Registro diario guardado");
    await onUpdated(silent ? "" : `Registro diario guardado para ${messenger.nombre}`);
  }, [messenger.id, messenger.nombre, onUpdated, recordCounts, recordDate]);

  useEffect(() => {
    if (tab !== "registro") return;
    if (skipRecordAutoSave.current) {
      skipRecordAutoSave.current = false;
      return;
    }

    const currentSignature = recordSignature(recordDate, recordCounts);
    if (currentSignature === lastRecordSignature.current) return;

    if (recordAutoSaveTimer.current) {
      clearTimeout(recordAutoSaveTimer.current);
    }

    recordAutoSaveTimer.current = setTimeout(() => {
      void saveDailyRecord(true);
    }, 800);

    return () => {
      if (recordAutoSaveTimer.current) {
        clearTimeout(recordAutoSaveTimer.current);
      }
    };
  }, [recordCounts, recordDate, saveDailyRecord, tab]);

  async function generateReport() {
    setBusy(true);
    setFeedback("");

    const imageParams = new URLSearchParams({
      mode: "single",
      messengerId: messenger.id,
      from,
      to,
    });

    const imageRes = await fetch(`/api/mensajeros/reportes?${imageParams.toString()}`);
    if (!imageRes.ok) {
      const imageJson = await imageRes.json().catch(() => ({ error: "No se pudo generar imagen del reporte" }));
      setFeedback(imageJson.error ?? "No se pudo generar imagen del reporte");
      setBusy(false);
      return;
    }

    const imageBlob = await imageRes.blob();
    const imageUrl = URL.createObjectURL(imageBlob);
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `${messenger.nombre.replace(/\s+/g, "_")}-${from}-${to}.jpg`;
    a.click();
    URL.revokeObjectURL(imageUrl);

    const res = await fetch("/api/mensajeros/gestion-diaria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "report",
        messengerId: messenger.id,
        from,
        to,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedback(json.error ?? "Imagen generada, pero no se pudo guardar el historial");
      setBusy(false);
      return;
    }

    setBusy(false);
    setFeedback(`Imagen generada y reporte guardado: ${formatCurrencyDOP(json.totalCents ?? 0)}`);
    await onUpdated(`Reporte generado para ${messenger.nombre}`);
  }

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-xs font-bold text-white">
              {initials(messenger.nombre)}
            </div>
            <div>
              <p className="font-display text-xl font-bold text-slate-900">{messenger.nombre}</p>
              <p className="text-xs text-slate-500">{messenger.telefono ?? "-"}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex border-b border-slate-200">
          {(["perfil", "registro", "reporte", "historial"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`border-b-2 px-4 py-3 text-sm ${
                tab === value
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {value === "perfil" ? "Perfil y tarifas" : null}
              {value === "registro" ? "Registro diario" : null}
              {value === "reporte" ? "Generar reporte" : null}
              {value === "historial" ? "Historial reportes" : null}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "perfil" ? (
            <div>
              <div className="mb-3 grid gap-3 md:grid-cols-3">
                <input
                  value={telefono}
                  onChange={(event) => setTelefono(event.target.value)}
                  placeholder="Telefono"
                  className="rounded-xl border border-slate-300 px-3 py-2"
                />
                <select
                  value={zona}
                  onChange={(event) => setZona(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                >
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
                <select
                  value={provinciaTrabajo}
                  onChange={(event) => setProvinciaTrabajo(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                >
                  {!provinces.length ? <option value="">Sin provincias configuradas</option> : null}
                  {provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                {SERVICE_ORDER.map((service) => (
                  <div key={service} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <p className="flex-1 text-sm text-slate-700">{SERVICE_LABEL[service]}</p>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={rates[service]}
                      onChange={(event) =>
                        setRates((prev) => ({ ...prev, [service]: Number(event.target.value || 0) }))
                      }
                      className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-right"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => void saveProfile()}
                disabled={busy}
                className="mt-4 rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Guardar perfil y tarifas
              </button>
            </div>
          ) : null}

          {tab === "registro" ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="date"
                  value={recordDate}
                  onChange={(event) => setRecordDate(event.target.value)}
                  disabled={busy}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {SERVICE_ORDER.map((service) => (
                  <label key={service} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {SERVICE_LABEL[service]}
                    <input
                      type="number"
                      min={0}
                      value={recordCounts[service]}
                      disabled={busy}
                      onChange={(event) =>
                        setRecordCounts((prev) => ({ ...prev, [service]: Number(event.target.value || 0) }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                ))}
              </div>
              {busy || savingRecord ? <p className="mt-3 text-xs text-slate-500">Guardando cambios...</p> : null}

              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">N</th>
                      <th className="px-3 py-2">R</th>
                      <th className="px-3 py-2">Rec</th>
                      <th className="px-3 py-2">M</th>
                      <th className="px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 12).map((record) => (
                      <tr key={record.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{dateKey(record.fecha)}</td>
                        <td className="px-3 py-2">{record.entregasNormales}</td>
                        <td className="px-3 py-2">{record.entregasRemotas}</td>
                        <td className="px-3 py-2">{record.recogidasBanco}</td>
                        <td className="px-3 py-2">{record.mandados}</td>
                        <td className="px-3 py-2 font-semibold">{formatCurrencyDOP(record.totalCents)}</td>
                      </tr>
                    ))}
                    {!records.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                          Sin registros diarios.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "reporte" ? (
            <div>
              <div className="mb-4 grid gap-2 md:grid-cols-2">
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Normales</th>
                      <th className="px-3 py-2">Remotas</th>
                      <th className="px-3 py-2">Recogidas</th>
                      <th className="px-3 py-2">Mandados</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRecords.map((record) => (
                      <tr key={record.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{dateKey(record.fecha)}</td>
                        <td className="px-3 py-2">{record.entregasNormales}</td>
                        <td className="px-3 py-2">{record.entregasRemotas}</td>
                        <td className="px-3 py-2">{record.recogidasBanco}</td>
                        <td className="px-3 py-2">{record.mandados}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrencyDOP(record.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3">
                <span className="text-xs uppercase tracking-wide text-slate-300">Total del periodo</span>
                <span className="font-display text-2xl font-bold text-emerald-400">{formatCurrencyDOP(previewTotal)}</span>
              </div>

              <button
                onClick={() => void generateReport()}
                disabled={busy}
                className="mt-4 rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Generar imagen y guardar
              </button>
            </div>
          ) : null}

          {tab === "historial" ? (
            <div className="space-y-2">
              {reports.map((report) => (
                <article key={report.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {dateKey(report.fromDate)} → {dateKey(report.toDate)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Generado: {new Date(report.generatedAt).toLocaleString("es-DO")}
                    </p>
                  </div>
                  <p className="font-display text-lg font-bold text-emerald-700">
                    {formatCurrencyDOP(report.totalCents)}
                  </p>
                </article>
              ))}
              {!reports.length ? <p className="text-sm text-slate-500">No hay reportes generados.</p> : null}
            </div>
          ) : null}

          {feedback ? <p className="mt-4 text-sm text-emerald-700">{feedback}</p> : null}
        </div>
      </div>
    </div>
  );
}
