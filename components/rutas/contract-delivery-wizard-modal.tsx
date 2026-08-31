"use client";

import { FileWarning, FileCheck2, X, AlertCircle } from "lucide-react";

export type ContractWizardCandidate = {
  itemId: string;
  cardId: string | null;
  tc: string;
  cedula: string | null;
  nombre: string | null;
  status: string | null;
  dispatchDate: string | null;
};

type Props = {
  candidate: ContractWizardCandidate;
  onConfirmWithoutContract: () => void;
  onConfirmWithContract?: () => void;
  onClose: () => void;
};

export function ContractDeliveryWizardModal({
  candidate,
  onConfirmWithoutContract,
  onConfirmWithContract,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Verificación de Contrato Requerido</h3>
              <p className="text-xs text-amber-800">Esta tarjeta requiere contrato físico firmado</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Card Info Box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Tarjeta a entregar
              </span>
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 font-mono">
                {candidate.tc}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="block text-slate-400">Cliente:</span>
                <span className="font-medium text-slate-800 truncate block">
                  {candidate.nombre || "Sin nombre registrado"}
                </span>
              </div>
              <div>
                <span className="block text-slate-400">Cédula:</span>
                <span className="font-medium text-slate-800 block">
                  {candidate.cedula || "No indicada"}
                </span>
              </div>
            </div>
          </div>

          {/* Question Banner */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-center">
            <p className="text-base font-semibold text-slate-900">
              ¿Tienes el contrato firmado de esta tarjeta aquí?
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Si marcas <strong>No</strong>, la tarjeta se registrará como entregada y quedará con estatus{" "}
              <span className="font-semibold text-amber-800">&quot;Entregada sin contrato&quot;</span> para su seguimiento
              en el módulo de <em>Contratos pendientes</em>.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmWithoutContract}
            className="w-full sm:w-auto rounded-xl border border-amber-300 bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition flex items-center justify-center gap-1.5"
          >
            <AlertCircle className="h-4 w-4" />
            No, guardar sin contrato
          </button>
          {onConfirmWithContract ? (
            <button
              type="button"
              onClick={onConfirmWithContract}
              className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition flex items-center justify-center gap-1.5"
            >
              <FileCheck2 className="h-4 w-4" />
              Sí, tengo el contrato
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
