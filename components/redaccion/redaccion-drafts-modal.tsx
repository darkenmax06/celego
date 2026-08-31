"use client";

import { useEffect, useId, useRef } from "react";
import { dispatchOriginLabel, type DispatchOrigin } from "@/lib/dispatch-origin";

export type SavedRedactionDraftSummary = {
  contextKey: string;
  updatedAt: string;
  version: number;
  payload: {
    mode?: "retorno" | "entrega";
    zona?: string;
    fecha?: string;
    retornos?: Array<{ cardId: string; tc: string; dispatchOrigin?: DispatchOrigin | null }>;
    entregas?: Array<{ cardId: string; tc: string; dispatchOrigin?: DispatchOrigin | null }>;
  };
};

type Props = {
  drafts: SavedRedactionDraftSummary[];
  activeDraftKey: string;
  onSelectDraft: (contextKey: string) => void;
  onDeleteDraft: (contextKey: string) => void;
  onCreateNewDraft: () => void;
  onClose: () => void;
};

function formatRelativeTime(dateStr: string) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return "hace unos segundos";
    if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`;
    return date.toLocaleDateString("es-DO", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function RedaccionDraftsModal({
  drafts,
  activeDraftKey,
  onSelectDraft,
  onDeleteDraft,
  onCreateNewDraft,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm transition-all"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div>
            <span className="inline-block rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-800">
              Gestor de Borradores
            </span>
            <h3 id={titleId} className="mt-0.5 font-display text-lg font-bold text-slate-900">
              Relaciones en Progreso
            </h3>
            <p className="text-xs text-slate-500">
              Cambia entre redacciones guardadas o crea una nueva sin perder tu trabajo.
            </p>
          </div>

          <button
            type="button"
            onClick={onCreateNewDraft}
            className="rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-800"
          >
            + Nueva Redacción
          </button>
        </div>

        {/* List of drafts */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {drafts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No hay borradores guardados actualmente.
            </div>
          ) : (
            drafts.map((item) => {
              const retornos = item.payload.retornos ?? [];
              const entregas = item.payload.entregas ?? [];
              const totalCards = retornos.length + entregas.length;
              const origin =
                [...retornos, ...entregas].find((r) => r.dispatchOrigin)?.dispatchOrigin ?? null;
              const isActive = item.contextKey === activeDraftKey;

              return (
                <div
                  key={item.contextKey}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition ${
                    isActive
                      ? "border-blue-400 bg-blue-50/50 ring-2 ring-blue-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          origin === "TORRE_POPULAR"
                            ? "bg-blue-100 text-blue-800"
                            : origin === "CENTRO_ACOPIO"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {origin === "TORRE_POPULAR"
                          ? "🏛️ Torre Popular"
                          : origin === "CENTRO_ACOPIO"
                            ? "📦 Centro de acopio"
                            : "📝 Sin procedencia fija"}
                      </span>

                      {isActive ? (
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          ● Activo en pantalla
                        </span>
                      ) : null}

                      <span className="text-xs font-medium text-slate-600">
                        Zona {item.payload.zona || "Este"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        <strong>{totalCards}</strong> tarjeta(s) ({retornos.length} retornos, {entregas.length} entregas)
                      </span>
                      {item.payload.fecha ? (
                        <span>Fecha: {item.payload.fecha}</span>
                      ) : null}
                      <span className="text-slate-400">
                        Guardado {formatRelativeTime(item.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isActive ? (
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Continuar editando
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectDraft(item.contextKey)}
                        className="rounded-lg bg-[#0f2544] px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-[#1a3860]"
                      >
                        ▶ Usar / Retomar
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteDraft(item.contextKey)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      title="Eliminar borrador"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-3">
          <p className="text-[11px] text-slate-500">
            Tus borradores se guardan automáticamente y no se borran al cerrar sesión o cambiar de página.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
