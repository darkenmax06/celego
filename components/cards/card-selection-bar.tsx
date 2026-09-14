"use client";

import { type ReactNode, useState } from "react";
import { Download, Layers, Plus, UserMinus, X } from "lucide-react";

/**
 * SDD card-groups — Work Unit F, Task 18.
 * SDD card-groups remediation — FIX 1 (selection review panel).
 *
 * Sticky bar rendered whenever `count > 0` (product decision: an off-screen
 * selection must never act silently — always visible while any card is
 * selected, with an always-available "Limpiar selección").
 *
 * The count itself is now a toggle button that opens a review panel listing
 * every selected id. A selection can include cards that are not on the
 * currently loaded page (spec: "Selection persists across pagination and
 * filter changes"), and — since Stage B made the selection app-wide across
 * `/tarjetas`, `/sla-vencidas` and `/operativo` — can even include cards that
 * the current screen's dataset does not contain at all. So the caller supplies
 * `cardsById` — a lookup built only from what this screen loaded — and any
 * `selectedIds` entry missing from it renders as a clearly-labelled minimal
 * entry (the raw id) instead of being silently dropped from the list. Each row can deselect itself individually via
 * `onDeselect`; "Limpiar selección" remains for the all-at-once case.
 *
 * "Quitar del grupo" is visible only when the current `grupo` filter holds
 * EXACTLY one real group id (not `SIN_GRUPO`) — removal targets one group.
 *
 * Group actions are optional so views without card groups (e.g. Actualizacion
 * masiva) can reuse the bar for other bulk actions such as "Exportar".
 */
export type SelectedCardEntry = {
  id: string;
  tc: string;
  customerName: string;
  cedula: string;
};

type Props = {
  count: number;
  selectedIds: string[];
  cardsById: Record<string, SelectedCardEntry>;
  activeGroupFilterIds?: string[];
  onClear: () => void;
  onDeselect: (cardId: string) => void;
  onCreateGroup?: () => void;
  onAssignExisting?: () => void;
  onRemoveFromGroup?: () => void;
  /** Opens the export wizard for the current selection. */
  onExport?: () => void;
  /** Extra view-specific actions rendered before the built-in ones. */
  actions?: ReactNode;
};

export function CardSelectionBar({
  count,
  selectedIds,
  cardsById,
  activeGroupFilterIds = [],
  onClear,
  onDeselect,
  onCreateGroup,
  onAssignExisting,
  onRemoveFromGroup,
  onExport,
  actions,
}: Props) {
  const [reviewOpen, setReviewOpen] = useState(false);

  if (count === 0) return null;

  const realGroupIds = activeGroupFilterIds.filter((id) => id !== "SIN_GRUPO");
  const canRemoveFromGroup = Boolean(onRemoveFromGroup) && realGroupIds.length === 1;
  const label = `${count} seleccionadas`;

  return (
    <div className="sticky bottom-0 z-30 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="relative">
        <button
          type="button"
          onClick={() => setReviewOpen((open) => !open)}
          aria-expanded={reviewOpen}
          className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-100"
        >
          {label}
        </button>

        {reviewOpen ? (
          <div className="absolute bottom-full left-0 mb-2 max-h-80 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 border-b border-slate-100 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tarjetas seleccionadas
            </div>
            <ul>
              {selectedIds.map((id) => {
                const entry = cardsById[id];
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 last:border-b-0"
                  >
                    {entry ? (
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-bold text-blue-700">{entry.tc}</p>
                        <p className="truncate text-xs text-slate-700">{entry.customerName}</p>
                        <p className="truncate text-[11px] text-slate-400">{entry.cedula}</p>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-slate-600">{id}</p>
                        <p className="text-[11px] italic text-amber-700">Fuera de esta vista</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeselect(id)}
                      aria-label={`Quitar tarjeta ${entry?.tc ?? id} de la selección`}
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {actions}
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>
        ) : null}
        {onCreateGroup ? (
          <button
            type="button"
            onClick={onCreateGroup}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Crear grupo con la selección
          </button>
        ) : null}
        {onAssignExisting ? (
          <button
            type="button"
            onClick={onAssignExisting}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Layers className="h-3.5 w-3.5" />
            Asignar a grupo existente
          </button>
        ) : null}
        {canRemoveFromGroup ? (
          <button
            type="button"
            onClick={onRemoveFromGroup}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            <UserMinus className="h-3.5 w-3.5" />
            Quitar del grupo
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar selección
        </button>
      </div>
    </div>
  );
}
