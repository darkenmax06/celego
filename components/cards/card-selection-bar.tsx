"use client";

import { Layers, Plus, UserMinus, X } from "lucide-react";

/**
 * SDD card-groups — Work Unit F, Task 18.
 *
 * Sticky bar rendered whenever `count > 0` (product decision: an off-screen
 * selection must never act silently — always visible while any card is
 * selected, with an always-available "Limpiar selección").
 *
 * "Quitar del grupo" is visible only when the current `grupo` filter holds
 * EXACTLY one real group id (not `SIN_GRUPO`) — removal targets one group.
 */
type Props = {
  count: number;
  activeGroupFilterIds: string[];
  onClear: () => void;
  onCreateGroup: () => void;
  onAssignExisting: () => void;
  onRemoveFromGroup: () => void;
};

export function CardSelectionBar({
  count,
  activeGroupFilterIds,
  onClear,
  onCreateGroup,
  onAssignExisting,
  onRemoveFromGroup,
}: Props) {
  if (count === 0) return null;

  const realGroupIds = activeGroupFilterIds.filter((id) => id !== "SIN_GRUPO");
  const canRemoveFromGroup = realGroupIds.length === 1;

  return (
    <div className="sticky bottom-0 z-30 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
      <span className="text-sm font-semibold text-slate-800">{count} seleccionadas</span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCreateGroup}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Crear grupo con la selección
        </button>
        <button
          type="button"
          onClick={onAssignExisting}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Layers className="h-3.5 w-3.5" />
          Asignar a grupo existente
        </button>
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
