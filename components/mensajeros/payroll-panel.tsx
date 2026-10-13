"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrencyDOP, toCents } from "@/lib/money";

type Period = {
  id: string;
  label: string;
  fromDate: string;
  toDate: string;
  messengerId: string | null;
  status: "ABIERTO" | "BLOQUEADO";
  pendingChanges: number;
};

type PaymentInstallment = {
  id: string;
  number: number;
  plannedCents: number;
  appliedCents: number | null;
  status: "PENDIENTE" | "APLICADA" | "OMITIDA";
  loan: { id: string; principalCents: number; note: string | null; installmentCount: number };
};

type Payment = {
  id: string;
  grossCents: number;
  deductionCents: number;
  netCents: number;
  lockedAt: string | null;
  period: { id: string; label: string };
  installments: PaymentInstallment[];
};

/** Day of a stored date-only value (midnight UTC) as dd/mm/yyyy, with no timezone shift. */
export function formatDay(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** Cut periods of one messenger and the payment of each: count, installments, lock. */
export function PayrollPanel({ messengerId, onChanged }: { messengerId: string; onChanged?: () => void }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const loadPeriods = useCallback(async () => {
    const res = await fetch(`/api/mensajeros/periodos?messengerId=${messengerId}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setPeriods(json.periods ?? []);
  }, [messengerId]);

  const loadPayment = useCallback(
    async (periodId: string) => {
      const res = await fetch(`/api/mensajeros/pagos?messengerId=${messengerId}&periodId=${periodId}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setPayment(json.payment);
      else setMessage(json.error ?? "No se pudo cargar el pago");
    },
    [messengerId],
  );

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    if (selected) void loadPayment(selected);
    else setPayment(null);
  }, [selected, loadPayment]);

  async function refreshAll() {
    await loadPeriods();
    if (selected) await loadPayment(selected);
    onChanged?.();
  }

  async function createPeriod() {
    setBusy(true);
    const res = await fetch("/api/mensajeros/periodos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, from, to, messengerId }),
    });
    const json = await res.json();
    setBusy(false);
    setMessage(res.ok ? "Periodo creado para este mensajero" : (json.error ?? "No se pudo crear el periodo"));
    if (res.ok) {
      setLabel("");
      setFrom("");
      setTo("");
      await loadPeriods();
    }
  }

  async function togglePeriod(period: Period) {
    const unlocking = period.status === "BLOQUEADO";
    if (unlocking && !window.confirm("Desbloquear permite editar los dias y las cuotas de este periodo. Debe volver a bloquearlo al terminar. ¿Continuar?")) return;
    setBusy(true);
    const res = await fetch("/api/mensajeros/periodos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: unlocking ? "UNLOCK" : "LOCK", periodId: period.id, messengerId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo cambiar el estado del periodo");
      return;
    }
    setMessage(
      unlocking
        ? json.pendingApplied
          ? `Periodo desbloqueado: se aplicaron ${json.pendingApplied} cambios de entregas que estaban pendientes`
          : "Periodo desbloqueado"
        : "Periodo bloqueado y pago cerrado",
    );
    await refreshAll();
  }

  async function changeInstallment(body: Record<string, unknown>) {
    const res = await fetch("/api/mensajeros/pagos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) setMessage(json.error ?? "No se pudo modificar la cuota");
    if (selected) await loadPayment(selected);
  }

  const locked = Boolean(payment?.lockedAt);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-1 text-sm font-semibold text-slate-900">Corte propio de este mensajero</p>
        <p className="mb-3 text-xs text-slate-500">Reemplaza al periodo general en las fechas que cubra.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Nombre
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Desde
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Hasta (corte)
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button
            onClick={() => void createPeriod()}
            disabled={busy || !label || !from || !to}
            className="self-end rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Crear periodo
          </button>
        </div>
      </div>

      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
      {!periods.length ? <p className="text-sm text-slate-500">No hay periodos de corte definidos. Cree uno general desde la pantalla de Mensajeros o uno propio aqui.</p> : null}

      <div className="space-y-2">
        {periods.map((period) => (
          <div key={period.id} className={`rounded-xl border p-3 ${selected === period.id ? "border-blue-400 bg-blue-50/40" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {period.label}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    {formatDay(period.fromDate)} al {formatDay(period.toDate)} · {period.messengerId ? "propio" : "general"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${period.status === "BLOQUEADO" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                    {period.status === "BLOQUEADO" ? "Bloqueado" : "Abierto"}
                  </span>
                  {period.pendingChanges > 0 ? (
                    <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
                      {period.pendingChanges} {period.pendingChanges === 1 ? "dia con cambios" : "dias con cambios"} de entregas pendientes
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelected(selected === period.id ? null : period.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {selected === period.id ? "Ocultar pago" : "Ver pago"}
                </button>
                <button
                  onClick={() => void togglePeriod(period)}
                  disabled={busy}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${period.status === "BLOQUEADO" ? "bg-amber-600" : "bg-[#0f2544]"}`}
                >
                  {period.status === "BLOQUEADO" ? "Desbloquear" : "Bloquear"}
                </button>
              </div>
            </div>

            {selected === period.id && payment ? (
              <div className="mt-3 rounded-lg bg-white p-3">
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <div>
                    <p className="text-slate-500">Ganado en el periodo</p>
                    <p className="text-sm font-semibold">{formatCurrencyDOP(payment.grossCents)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Descuento de cuotas</p>
                    <p className="text-sm font-semibold text-rose-700">- {formatCurrencyDOP(payment.deductionCents)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">A pagar</p>
                    <p className={`text-sm font-bold ${payment.netCents < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatCurrencyDOP(payment.netCents)}</p>
                  </div>
                </div>
                {payment.netCents < 0 ? <p className="mt-2 text-xs text-rose-700">Las cuotas superan lo ganado en el periodo. Baje u omita una cuota si no quiere dejar el pago en negativo.</p> : null}

                {payment.installments.length ? (
                  <table className="mt-3 w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1">Prestamo</th>
                        <th>Cuota</th>
                        <th>Plan</th>
                        <th>Descontar</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {payment.installments.map((item) => {
                        const omitted = item.status === "OMITIDA";
                        return (
                          <tr key={item.id} className="border-t border-slate-100">
                            <td className="py-1.5">
                              {formatCurrencyDOP(item.loan.principalCents)}
                              {item.loan.note ? ` · ${item.loan.note}` : ""}
                            </td>
                            <td>
                              #{item.number}/{item.loan.installmentCount}
                            </td>
                            <td>{formatCurrencyDOP(item.plannedCents)}</td>
                            <td>
                              {omitted ? (
                                <span className="font-semibold text-amber-700">Omitida</span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  disabled={locked}
                                  defaultValue={((item.appliedCents ?? item.plannedCents) / 100).toFixed(2)}
                                  key={`${item.id}-${item.appliedCents}`}
                                  onBlur={(e) => {
                                    const cents = toCents(Number(e.target.value) || 0);
                                    if (cents !== (item.appliedCents ?? item.plannedCents)) void changeInstallment({ action: "SET_AMOUNT", installmentId: item.id, appliedCents: cents });
                                  }}
                                  className="w-28 rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                                />
                              )}
                            </td>
                            <td className="text-right">
                              {locked ? null : omitted ? (
                                <button onClick={() => void changeInstallment({ action: "RESTORE", installmentId: item.id })} className="font-semibold text-blue-700">
                                  Restaurar
                                </button>
                              ) : (
                                <button onClick={() => void changeInstallment({ action: "OMIT", installmentId: item.id })} className="font-semibold text-amber-700">
                                  Omitir
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">Sin cuotas de prestamo en este pago.</p>
                )}
                {locked ? <p className="mt-2 text-xs text-slate-500">Pago cerrado. Desbloquee el periodo para modificar cuotas o dias.</p> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
