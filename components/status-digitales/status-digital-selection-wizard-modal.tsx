"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  OperationalCardPicker,
  type OperationalCard,
} from "@/components/cards/operational-card-picker";
import { StatusBadge } from "@/components/ui/status-badge";

export type AmbiguousCardOption = {
  id: string;
  tc: string;
  status: string;
  dispatchDate: string | null;
  customer: { nombre: string; cedula: string };
};

export type PendingWizardRow = {
  fileName: string;
  identifier: string;
  action: "AMBIGUA_REQUIERE_REVISION" | "NO_ENCONTRADA";
  options?: AmbiguousCardOption[];
};

type Props = {
  pending: PendingWizardRow[];
  resolvedCount: number;
  totalCount: number;
  onResolve: (fileName: string, cardId: string) => void;
  onSkip: (fileName: string) => void;
  onClose: () => void;
  onApply: () => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha de despacho";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-DO");
}

export function StatusDigitalSelectionWizardModal({
  pending,
  resolvedCount,
  totalCount,
  onResolve,
  onSkip,
  onClose,
  onApply,
}: Props) {
  const dialogTitleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchMessage, setSearchMessage] = useState("");

  const current = pending[0] ?? null;

  useEffect(() => {
    setSearchValue("");
    setSearchMessage("");
  }, [current?.fileName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleCardSelected(card: OperationalCard) {
    if (!current) return;
    onResolve(current.fileName, card.id);
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 outline-none"
      >
        <div className="shrink-0 bg-gradient-to-r from-[#0f2544] to-slate-800 px-5 py-3 text-white">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-white/80">
            Asistente de seleccion manual
          </span>
          <h2 id={dialogTitleId} className="font-display text-base font-bold leading-tight">
            {current ? `Pendiente ${resolvedCount + 1} de ${totalCount}` : "Todo identificado"}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {!current ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Ya identificaste las {totalCount} imagen(es) pendientes. Aplica los cambios para
              actualizar las tarjetas seleccionadas.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <span className="block font-semibold text-slate-900">{current.fileName}</span>
                <span className="text-slate-500">Buscado como: {current.identifier}</span>
              </div>

              {current.action === "AMBIGUA_REQUIERE_REVISION" ? (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    Hay mas de una tarjeta vigente con este nombre. Elige cual corresponde:
                  </p>
                  <div className="space-y-2">
                    {(current.options ?? []).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onResolve(current.fileName, option.id)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{option.customer.nombre}</span>
                          <StatusBadge value={option.status} />
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                          <span>Cedula: {option.customer.cedula}</span>
                          <span>Despacho: {formatDate(option.dispatchDate)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-rose-700">
                    No se encontro tarjeta automaticamente. Buscala manualmente:
                  </p>
                  <OperationalCardPicker
                    value={searchValue}
                    onValueChange={setSearchValue}
                    onCardSelected={handleCardSelected}
                    onMessage={setSearchMessage}
                    autoFocus
                    inputLabel="Buscar tarjeta para esta imagen"
                  />
                  {searchMessage ? (
                    <p className="mt-2 text-xs text-rose-700">{searchMessage}</p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <div className="text-[10px] text-slate-500">
            {resolvedCount} de {totalCount} identificadas
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {current ? (
              <button
                type="button"
                onClick={() => onSkip(current.fileName)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Omitir esta imagen
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cerrar
            </button>
            {!current ? (
              <button
                type="button"
                onClick={onApply}
                className="rounded-lg bg-[#0f2544] px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#1a3860]"
              >
                Aplicar selecciones
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
