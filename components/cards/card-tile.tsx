"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { CalendarClock, PhoneCall, Truck, UserRound } from "lucide-react";
import { CardSelectCheckbox } from "@/components/cards/card-select-checkbox";
import { ContactStateBadge } from "@/components/cards/contact-state-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CardTileData } from "@/lib/cards/card-tile-data";
import { cn } from "@/lib/utils";

/**
 * Calls overhaul: the "typical card" tile, extracted from the tarjetas cards
 * view and reused by operativo and SLA vencidas. Purely presentational: the
 * container decides what clicking the tile does (`onOpen`) and which footer
 * actions to show.
 */

export type CardTileProps = {
  data: CardTileData;
  /** Bulk-selection checkbox (tarjetas). */
  selection?: { checked: boolean; onToggle: () => void };
  /** Makes the whole tile an accessible button (call workspaces). */
  onOpen?: () => void;
  footerLeft?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("es-DO");
}

function SlaChip({ data }: { data: CardTileData }) {
  const due = formatDate(data.slaDueDate);
  if (typeof data.diasVencidos === "number" && data.diasVencidos > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
        <CalendarClock className="h-3 w-3" />
        {due ? `SLA ${due} · ` : ""}
        {data.diasVencidos} día(s) vencida
      </span>
    );
  }
  if (typeof data.remaining === "number") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold",
          data.remaining <= 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800",
        )}
      >
        <CalendarClock className="h-3 w-3" />
        SLA: {data.remaining}d{due ? ` (${due})` : ""}
      </span>
    );
  }
  if (due) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
        <CalendarClock className="h-3 w-3" />
        SLA {due}
      </span>
    );
  }
  return null;
}

export function CardTile({ data, selection, onOpen, footerLeft, actions, className }: CardTileProps) {
  const interactive = Boolean(onOpen);
  const hasCallMeta =
    data.slaDueDate !== undefined ||
    data.diasVencidos !== undefined ||
    data.remaining !== undefined ||
    data.attempts !== undefined ||
    data.asignadoA !== undefined ||
    data.mensajero !== undefined;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Abrir gestión de ${data.nombre} (${data.tc})` : undefined}
      onClick={onOpen}
      onKeyDown={interactive ? handleKeyDown : undefined}
      data-testid="card-tile"
      className={cn(
        "flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-slate-300",
        interactive && "cursor-pointer hover:border-blue-300 hover:shadow-md focus:outline-hidden focus:ring-2 focus:ring-blue-500/30",
        className,
      )}
    >
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {selection ? (
              <CardSelectCheckbox
                checked={selection.checked}
                onChange={() => selection.onToggle()}
                label={`Seleccionar tarjeta ${data.tc}`}
              />
            ) : null}
            <span className="font-mono text-sm font-bold text-blue-700">{data.tc}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {data.contactoEstado ? <ContactStateBadge value={data.contactoEstado} canal={data.canalContacto} /> : null}
            <StatusBadge value={data.status} />
          </div>
        </div>
        <h4 className="mt-2 font-semibold text-slate-900">{data.nombre}</h4>
        <p className="text-xs text-slate-500">Cédula: {data.cedula}</p>
        <p className="mt-2 text-xs text-slate-600">
          {data.provincia} • {data.zona} {data.isRemote ? "(Remota)" : ""}
        </p>

        {hasCallMeta ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <SlaChip data={data} />
            {data.urgentLabel ? (
              <span className="rounded-md border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-800">
                {data.urgentLabel}
              </span>
            ) : null}
            {typeof data.attempts === "number" && data.attempts > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                <PhoneCall className="h-3 w-3" />
                {data.attempts} {data.attempts === 1 ? "intento" : "intentos"}
              </span>
            ) : null}
            {data.asignadoA !== undefined ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                  data.asignadoA ? "border-blue-200 bg-blue-50 text-blue-800" : "border-dashed border-slate-300 text-slate-500",
                )}
              >
                <UserRound className="h-3 w-3" />
                {data.asignadoA ? data.asignadoA.name : "Sin asignar"}
              </span>
            ) : null}
            {data.mensajero !== undefined ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                <Truck className="h-3 w-3" />
                {data.mensajero || "Sin mensajero"}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {footerLeft || actions ? (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-400">{footerLeft}</span>
          {/* Footer actions never trigger the tile's own `onOpen`. */}
          <div className="flex gap-1.5" onClick={(event) => event.stopPropagation()}>
            {actions}
          </div>
        </div>
      ) : null}
    </div>
  );
}
