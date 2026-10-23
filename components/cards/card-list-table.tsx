"use client";

import type { ReactNode } from "react";
import { ContactStateBadge } from "@/components/cards/contact-state-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CardTileData } from "@/lib/cards/card-tile-data";

/**
 * List ("table") counterpart of `CardTileGrid` for the call workspaces. It
 * renders the same `CardTileData` view model, so a page can switch between
 * tiles and list without mapping its rows twice.
 */

type Props<T extends CardTileData> = {
  items: T[];
  getKey: (item: T) => string;
  /** Row checkboxes plus a select-all header; omit to hide the column. */
  selection?: {
    isSelected: (item: T) => boolean;
    toggle: (item: T) => void;
    setAll: (checked: boolean) => void;
  };
  /** Makes the client cell a link-style button (e.g. open the call detail). */
  onOpen?: (item: T) => void;
  renderActions?: (item: T) => ReactNode;
  loading?: boolean;
  emptyMessage?: string;
};

function slaLabel(data: CardTileData) {
  if (typeof data.diasVencidos === "number" && data.diasVencidos > 0) return `${data.diasVencidos} día(s) vencida`;
  if (typeof data.remaining === "number") return `${data.remaining}d`;
  return "—";
}

export function CardListTable<T extends CardTileData>({
  items,
  getKey,
  selection,
  onOpen,
  renderActions,
  loading = false,
  emptyMessage = "No hay tarjetas que coincidan con estos filtros.",
}: Props<T>) {
  const allSelected = Boolean(selection) && items.length > 0 && items.every((item) => selection!.isSelected(item));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            {selection ? (
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todas"
                  checked={allSelected}
                  onChange={(event) => selection.setAll(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
            ) : null}
            <th className="px-3 py-2">TC</th>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2">Cédula</th>
            <th className="px-3 py-2">Provincia / Zona</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Gestión</th>
            <th className="px-3 py-2">Asignado a</th>
            <th className="px-3 py-2">Mensajero</th>
            <th className="px-3 py-2">SLA</th>
            {renderActions ? <th className="px-3 py-2 text-right">Acciones</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={getKey(item)} className="hover:bg-slate-50/70">
              {selection ? (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar ${item.tc}`}
                    checked={selection.isSelected(item)}
                    onChange={() => selection.toggle(item)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>
              ) : null}
              <td className="px-3 py-2 font-mono text-xs text-blue-700">{item.tc}</td>
              <td className="px-3 py-2 font-semibold text-slate-900">
                {onOpen ? (
                  <button type="button" onClick={() => onOpen(item)} className="text-left hover:underline">
                    {item.nombre}
                  </button>
                ) : (
                  item.nombre
                )}
                {item.urgentLabel ? (
                  <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                    {item.urgentLabel}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{item.cedula}</td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {[item.provincia, item.zona].filter(Boolean).join(" • ") || "—"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge value={item.status} />
              </td>
              <td className="px-3 py-2">
                {item.contactoEstado ? <ContactStateBadge value={item.contactoEstado} canal={item.canalContacto} /> : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{item.asignadoA?.name ?? "Sin asignar"}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{item.mensajero ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{slaLabel(item)}</td>
              {renderActions ? <td className="px-3 py-2 text-right">{renderActions(item)}</td> : null}
            </tr>
          ))}
          {!items.length && !loading ? (
            <tr>
              <td colSpan={99} className="py-8 text-center text-sm text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
