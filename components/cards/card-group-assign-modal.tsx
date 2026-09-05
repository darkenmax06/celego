"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { CardGroupSummary } from "@/lib/use-card-groups";

/**
 * SDD card-groups — Work Unit F, Task 20.
 *
 * Existing-group picker vs new-name field, issuing exactly one call either
 * way (design decision: create-from-selection and bulk-assign stay two
 * endpoints, but the modal itself is a single UI surface). States the
 * off-filter count before the action executes (spec: bulk-action
 * confirmations must name it), and surfaces `{added, alreadyMember}` after a
 * successful assignment.
 */
type AssignResult = { added: number; alreadyMember: number };

type Props = {
  cardIds: string[];
  offFilterCount: number;
  groups: CardGroupSummary[];
  onClose: () => void;
  onSuccess: (result: AssignResult) => void;
};

export function CardGroupAssignModal({ cardIds, offFilterCount, groups, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"existing" | "new">(groups.length > 0 ? "existing" : "new");
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssignResult | null>(null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const response =
        mode === "existing"
          ? await fetch(`/api/card-groups/${selectedGroupId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addCardIds: cardIds }),
            })
          : await fetch("/api/card-groups", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: newName, cardIds }),
            });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "No se pudo completar la asignación");
        return;
      }

      const body = (await response.json()) as AssignResult;
      const assignResult = { added: body.added, alreadyMember: body.alreadyMember };
      setResult(assignResult);
      onSuccess(assignResult);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Asignar a grupo</h3>
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
          {offFilterCount > 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              {offFilterCount} de las {cardIds.length} tarjetas seleccionadas están fuera del filtro
              actual.
            </p>
          ) : null}

          {result ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm font-semibold text-emerald-800">
              {result.added} agregadas, {result.alreadyMember} ya eran miembros.
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    mode === "existing" ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700"
                  }`}
                >
                  Grupo existente
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    mode === "new" ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700"
                  }`}
                >
                  Grupo nuevo
                </button>
              </div>

              {mode === "existing" ? (
                <label className="block text-xs font-semibold text-slate-600">
                  Grupo existente
                  <select
                    aria-label="Grupo existente"
                    value={selectedGroupId}
                    onChange={(event) => setSelectedGroupId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-xs font-semibold text-slate-600">
                  Nombre del grupo
                  <input
                    type="text"
                    aria-label="Nombre del grupo"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              )}

              {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {result ? "Cerrar" : "Cancelar"}
          </button>
          {!result ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || (mode === "existing" ? !selectedGroupId : !newName.trim())}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Asignar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
