"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { formatDay } from "@/components/mensajeros/payroll-panel";

type Period = {
  id: string;
  label: string;
  fromDate: string;
  toDate: string;
  messengerId: string | null;
  lockedCount: number;
};

/** General cut periods: they apply to every messenger that has no period of its own for those dates. */
export function GeneralPeriods() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/mensajeros/periodos", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setPeriods((json.periods ?? []).filter((period: Period) => period.messengerId === null));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/mensajeros/periodos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, from, to }),
    });
    const json = await res.json();
    setBusy(false);
    setMessage(res.ok ? "Periodo general creado" : (json.error ?? "No se pudo crear el periodo"));
    if (res.ok) {
      setLabel("");
      setFrom("");
      setTo("");
      await load();
    }
  }

  async function lockAll(period: Period) {
    if (!window.confirm(`Bloquear "${period.label}" cierra el pago de todos los mensajeros activos. ¿Continuar?`)) return;
    setBusy(true);
    const res = await fetch("/api/mensajeros/periodos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "LOCK_ALL", periodId: period.id }),
    });
    const json = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Periodo bloqueado para ${json.locked} mensajeros` : (json.error ?? "No se pudo bloquear"));
    await load();
  }

  async function remove(period: Period) {
    if (!window.confirm(`¿Eliminar el periodo "${period.label}"?`)) return;
    const res = await fetch(`/api/mensajeros/periodos?id=${period.id}`, { method: "DELETE" });
    const json = await res.json();
    setMessage(res.ok ? "Periodo eliminado" : (json.error ?? "No se pudo eliminar"));
    await load();
  }

  return (
    <Panel>
      <p className="text-sm font-semibold text-slate-900">Periodos de corte (general)</p>
      <p className="mb-3 text-xs text-slate-500">
        Definen desde y hasta que dia valen las entregas de cada pago. Cada mensajero puede tener un corte propio en su perfil.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">
          Nombre
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Quincena 1 octubre" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Hasta (corte)
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button onClick={() => void create()} disabled={busy || !label || !from || !to} className="self-end rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Crear periodo
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-slate-600">{message}</p> : null}

      {periods.length ? (
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {periods.map((period) => (
            <li key={period.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold text-slate-900">{period.label}</span>{" "}
                <span className="text-xs text-slate-500">
                  {formatDay(period.fromDate)} al {formatDay(period.toDate)} · {period.lockedCount} mensajeros bloqueados
                </span>
              </span>
              <span className="flex gap-2">
                <button onClick={() => void lockAll(period)} disabled={busy} className="rounded-lg bg-[#0f2544] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  Bloquear a todos
                </button>
                <button onClick={() => void remove(period)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">
                  Eliminar
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
