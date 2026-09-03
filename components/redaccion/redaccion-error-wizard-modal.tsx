"use client";

import { useEffect, useId, useRef } from "react";
import { type OperationalCard } from "@/components/cards/operational-card-picker";
import { StatusBadge } from "@/components/ui/status-badge";
import { dispatchOriginLabel, type DispatchOrigin } from "@/lib/dispatch-origin";

export type RedactionWizardErrorType =
  | "MIXED_ORIGIN"
  | "MISSING_ORIGIN"
  | "DUPLICATE"
  | "NOT_FOUND"
  | "APPROVAL_VALIDATION"
  | "GENERIC";

export type RedactionWizardErrorState = {
  type: RedactionWizardErrorType;
  title: string;
  subtitle?: string;
  message: string;
  scannedCard?: OperationalCard | null;
  scannedQuery?: string;
  draftOrigin?: DispatchOrigin | null;
  cardOrigin?: DispatchOrigin | null;
  zona?: string;
  totalDraftCards?: number;
  missingCards?: Array<{ tc: string; nombre: string }>;
  suggestedAction?: string;
};

type Props = {
  error: RedactionWizardErrorState;
  onClose: () => void;
  onSaveCurrentAndSwitchOrigin?: (newOrigin: DispatchOrigin, card?: OperationalCard | null) => void;
  onClearDraftAndSwitchOrigin?: (newOrigin: DispatchOrigin) => void;
};

export function RedaccionErrorWizardModal({
  error,
  onClose,
  onSaveCurrentAndSwitchOrigin,
  onClearDraftAndSwitchOrigin,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const dialogTitleId = useId();
  const dialogDescId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const timer = setTimeout(() => {
      primaryButtonRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [onClose]);

  const isOriginConflict = error.type === "MIXED_ORIGIN";
  const isMissingOrigin = error.type === "MISSING_ORIGIN";
  const isDuplicate = error.type === "DUPLICATE";
  const isApproval = error.type === "APPROVAL_VALIDATION";

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm transition-all"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Compact Top visual alert bar */}
        <div
          className={`shrink-0 px-5 py-3 ${
            isOriginConflict
              ? "bg-gradient-to-r from-rose-600 via-rose-700 to-amber-700 text-white"
              : isDuplicate
                ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white"
                : isApproval
                  ? "bg-gradient-to-r from-indigo-700 to-slate-800 text-white"
                  : "bg-gradient-to-r from-rose-700 to-slate-800 text-white"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 shadow-inner backdrop-blur-md">
                {isOriginConflict ? (
                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                ) : isDuplicate ? (
                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 block leading-tight">
                  Asistente de Validación Operativa
                </span>
                <h2 id={dialogTitleId} className="font-display text-base font-bold leading-tight">
                  {error.title}
                </h2>
                {error.subtitle ? (
                  <p className="text-[11px] text-white/80 leading-tight">{error.subtitle}</p>
                ) : null}
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg bg-white/15 p-1 text-white/90 transition hover:bg-white/30 hover:text-white"
              title="Cerrar (Esc)"
              aria-label="Cerrar modal"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Compact Modal body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {/* Main Error Message Banner (only for non-origin or short alert) */}
          {!isOriginConflict ? (
            <div
              id={dialogDescId}
              className={`rounded-lg border p-3 text-xs leading-relaxed ${
                isDuplicate
                  ? "border-amber-200 bg-amber-50/70 text-amber-950 font-medium"
                  : "border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {error.message}
            </div>
          ) : null}

          {/* Comparative Origin Step Wizard Diagram */}
          {isOriginConflict ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Comparativa de Procedencias
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {/* Lote actual */}
                <div className="rounded-lg border border-blue-200 bg-white p-2.5 shadow-sm">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500">Redacción Actual</span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                      🏛️ {dispatchOriginLabel(error.draftOrigin)}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-600 space-y-0.5">
                    <p>
                      <span className="text-slate-500">Zona:</span> {error.zona || "Este"}
                    </p>
                    <p>
                      <span className="text-slate-500">Pistoleadas:</span>{" "}
                      <strong className="text-slate-800">{error.totalDraftCards ?? 0} tarjeta(s)</strong>
                    </p>
                  </div>
                </div>

                {/* Tarjeta pistoleada rechazada */}
                <div className="rounded-lg border border-rose-300 bg-rose-50/50 p-2.5 shadow-sm ring-1 ring-rose-400/30">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-semibold text-rose-700">Tarjeta Rechazada</span>
                    <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      📦 {dispatchOriginLabel(error.cardOrigin)}
                    </span>
                  </div>
                  {error.scannedCard ? (
                    <div className="mt-1.5 text-[11px] text-slate-700 space-y-0.5">
                      <p>
                        <span className="text-slate-500">TC:</span>{" "}
                        <span className="font-semibold text-blue-700">{error.scannedCard.tc}</span>
                      </p>
                      <p className="truncate">
                        <span className="text-slate-500">Cliente:</span>{" "}
                        {error.scannedCard.customer.nombre}
                      </p>
                      <p>
                        <span className="text-slate-500">Cédula:</span>{" "}
                        {error.scannedCard.customer.cedula}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Explanatory rule note */}
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200/60 px-2.5 py-1.5 text-[11px] text-amber-900 leading-snug">
                <strong>Regla de negocio:</strong> Las redacciones no permiten mezclar tarjetas de <em>Torre Popular</em> y <em>Centro de acopio</em> en un mismo documento para garantizar la trazabilidad de lotes.
              </div>
            </div>
          ) : null}

          {/* Missing Origin Card details */}
          {isMissingOrigin && error.scannedCard ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm text-xs text-slate-700">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Información de la Tarjeta
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="text-slate-500">TC:</span> <strong className="text-blue-700">{error.scannedCard.tc}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Cédula:</span> {error.scannedCard.customer.cedula}
                </div>
                <div className="col-span-2 truncate">
                  <span className="text-slate-500">Cliente:</span> {error.scannedCard.customer.nombre}
                </div>
              </div>
            </div>
          ) : null}

          {/* Duplicate Card details */}
          {isDuplicate && error.scannedCard ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 shadow-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-900">Tarjeta ya registrada</span>
                <StatusBadge value={error.scannedCard.status} />
              </div>
              <p className="mt-1 text-xs text-amber-800">
                La tarjeta <strong>{error.scannedCard.tc}</strong> de{" "}
                <strong>{error.scannedCard.customer.nombre}</strong> ya está en la lista.
              </p>
            </div>
          ) : null}

          {/* Missing reasons list for Approval */}
          {isApproval && error.missingCards && error.missingCards.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1.5">
                Tarjetas pendientes de motivo ({error.missingCards.length})
              </p>
              <ul className="max-h-28 overflow-y-auto divide-y divide-slate-100 text-xs text-slate-700">
                {error.missingCards.map((item) => (
                  <li key={item.tc} className="flex items-center justify-between py-1">
                    <span className="font-semibold text-blue-700">{item.tc}</span>
                    <span className="text-slate-600 truncate max-w-[200px]">{item.nombre}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Practical Step / Resolution Guide */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
              <span>💡</span> Pasos sugeridos para resolver
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-blue-950">
              {error.suggestedAction ||
                "Aparta la tarjeta física y continúa pistoleando las tarjetas correspondientes a esta procedencia."}
            </p>
          </div>
        </div>

        {/* Modal footer actions */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <div className="text-[10px] text-slate-500">
            <kbd className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[9px] text-slate-700">Enter</kbd> o{" "}
            <kbd className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[9px] text-slate-700">Esc</kbd> para volver
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOriginConflict && error.cardOrigin && onSaveCurrentAndSwitchOrigin ? (
              <button
                type="button"
                onClick={() => {
                  if (error.cardOrigin) {
                    onSaveCurrentAndSwitchOrigin(error.cardOrigin, error.scannedCard);
                  }
                }}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-100"
              >
                💾 Guardar actual y abrir {dispatchOriginLabel(error.cardOrigin)}
              </button>
            ) : null}

            <button
              ref={primaryButtonRef}
              type="button"
              onClick={onClose}
              className="rounded-lg bg-[#0f2544] px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-[#1a3860] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f2544]"
            >
              Entendido, continuar pistoleando
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
