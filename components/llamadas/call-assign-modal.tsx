"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useCallOperators } from "@/lib/llamadas/use-call-operators";

/**
 * Calls overhaul: the ONE modal to assign (or unassign) call work to an
 * operator for a set of cards. Modelled on `CardGroupAssignModal`: one call
 * per submit, result counts shown after success.
 *
 * - `mode="assign"`   → POST   /api/llamadas/asignaciones { cardIds, assignedToId }
 * - `mode="unassign"` → DELETE /api/llamadas/asignaciones { cardIds }
 */

export type CallAssignResult = {
  asignadoA: { id: string; name: string };
  requested: number;
  assigned: number;
  reassigned: number;
  unchanged: number;
  notFound: number;
};

export type CallUnassignResult = { removed: number };

type Props = {
  cardIds: string[];
  mode?: "assign" | "unassign";
  onClose: () => void;
  onAssigned?: (result: CallAssignResult) => void;
  onUnassigned?: (result: CallUnassignResult) => void;
};

const ENDPOINT = "/api/llamadas/asignaciones";
/** Server-side limit per request (`app/api/llamadas/asignaciones/route.ts`). */
export const CALL_ASSIGN_MAX_CARDS = 1000;

export function CallAssignModal({ cardIds, mode = "assign", onClose, onAssigned, onUnassigned }: Props) {
  const isAssign = mode === "assign";
  const { operadores, loading: loadingOperators, error: operatorsError } = useCallOperators(isAssign);
  const [assignedToId, setAssignedToId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<CallAssignResult | null>(null);
  const [unassignResult, setUnassignResult] = useState<CallUnassignResult | null>(null);

  useEffect(() => {
    if (!assignedToId && operadores.length) setAssignedToId(operadores[0].id);
  }, [operadores, assignedToId]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const done = Boolean(assignResult || unassignResult);
  const overLimit = cardIds.length > CALL_ASSIGN_MAX_CARDS;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: isAssign ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAssign ? { cardIds, assignedToId } : { cardIds }),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "No se pudo completar la operación");
        return;
      }
      if (isAssign) {
        const result = body as unknown as CallAssignResult;
        setAssignResult(result);
        onAssigned?.(result);
      } else {
        const result = { removed: Number(body.removed) || 0 };
        setUnassignResult(result);
        onUnassigned?.(result);
      }
    } catch {
      setError("No se pudo completar la operación");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isAssign ? "Asignar a operario" : "Quitar asignación"}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-900">{isAssign ? "Asignar a operario" : "Quitar asignación"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-600">
            {cardIds.length} {cardIds.length === 1 ? "tarjeta seleccionada" : "tarjetas seleccionadas"}.
          </p>

          {assignResult ? (
            <div
              role="status"
              className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              <p className="font-semibold">Asignadas a {assignResult.asignadoA.name}</p>
              <p>
                {assignResult.assigned} asignadas, {assignResult.reassigned} reasignadas,{" "}
                {assignResult.unchanged} sin cambios, {assignResult.notFound} no encontradas.
              </p>
            </div>
          ) : unassignResult ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
            >
              Se quitó la asignación de {unassignResult.removed}{" "}
              {unassignResult.removed === 1 ? "tarjeta" : "tarjetas"}.
            </p>
          ) : isAssign ? (
            <label className="block text-xs font-semibold text-slate-600">
              Operario
              <select
                aria-label="Operario"
                value={assignedToId}
                onChange={(event) => setAssignedToId(event.target.value)}
                disabled={loadingOperators || !operadores.length}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {loadingOperators ? <option value="">Cargando operarios...</option> : null}
                {operadores.map((operador) => (
                  <option key={operador.id} value={operador.id}>
                    {operador.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              Las tarjetas seleccionadas quedarán sin operario asignado.
            </p>
          )}

          {overLimit && !done ? (
            <p className="text-xs font-semibold text-red-600">
              Máximo {CALL_ASSIGN_MAX_CARDS} tarjetas por operación. Reduce la selección.
            </p>
          ) : null}
          {operatorsError && !done ? <p className="text-xs font-semibold text-red-600">{operatorsError}</p> : null}
          {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {done ? "Cerrar" : "Cancelar"}
          </button>
          {!done ? (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !cardIds.length || overLimit || (isAssign && !assignedToId)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 ${
                isAssign ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {submitting ? "Procesando..." : isAssign ? "Asignar" : "Quitar asignación"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
