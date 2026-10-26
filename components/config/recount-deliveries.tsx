"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";

type Result = {
  cardsChecked: number;
  daysTouched: number;
  updated: number;
  pendingLocked: number;
  unchanged: number;
};

/**
 * Rebuilds the messengers' automatic delivery count over a date range, so
 * deliveries made before the automatic count existed are credited as well.
 */
export function RecountDeliveries() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setConfirming(false);
    setBusy(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/mensajeros/conteo/recalcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo recalcular el conteo");
      return;
    }
    setResult(json);
  }

  return (
    <Panel title="Conteo automatico de entregas">
      <p className="mb-3 text-xs text-slate-500">
        El conteo de cada mensajero se actualiza solo cuando una entrega o entrega digital cambia. Use esto para aplicarlo a tarjetas anteriores: elija el rango de fechas de entrega a recalcular (maximo 93 dias).
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button onClick={() => setConfirming(true)} disabled={busy || !from || !to} className="self-end rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Recalculando..." : "Recalcular conteo"}
        </button>
      </div>
      {error ? <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p> : null}
      {result ? (
        <p className="mt-3 text-xs text-slate-700">
          {result.cardsChecked} tarjetas revisadas, {result.daysTouched} dias de mensajeros evaluados: {result.updated} actualizados, {result.unchanged} sin cambios
          {result.pendingLocked ? `, ${result.pendingLocked} en periodos bloqueados (quedan pendientes hasta desbloquear)` : ""}.
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Recalcular conteo"
        message={`Se recalculará el conteo de entregas de todos los mensajeros del ${from} al ${to}. Los periodos bloqueados no se modifican: sus cambios quedan pendientes. ¿Continuar?`}
        confirmLabel="Recalcular"
        tone="default"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void run()}
      />
    </Panel>
  );
}
