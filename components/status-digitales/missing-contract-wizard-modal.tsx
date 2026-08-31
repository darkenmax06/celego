"use client";

import { FileWarning, AlertTriangle, X, ArrowRight } from "lucide-react";

export type MissingContractCardItem = {
  fileName: string;
  identifier: string;
  tc: string;
  nombre?: string | null;
  cedula?: string | null;
  provincia?: string | null;
};

type Props = {
  items: MissingContractCardItem[];
  onConfirm: () => void;
  onClose: () => void;
};

export function MissingContractWizardModal({ items, onConfirm, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">
                Tarjetas pendientes de contrato ({items.length})
              </h3>
              <p className="text-xs text-amber-800">
                Imágenes de entrega sin archivo de contrato firmado adjunto
              </p>
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
          {/* Warning Banner */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">
                Se detectaron {items.length} {items.length === 1 ? "tarjeta que requiere" : "tarjetas que requieren"} contrato firmado.
              </p>
              <p className="mt-0.5 text-amber-800">
                No se encontró su imagen de contrato correspondiente (ej. <code>{items[0]?.identifier || "TC"} (C).jpg</code>).
                Si procedes, se registrarán con el estatus <strong>&quot;Entrega digital sin contrato&quot;</strong> y podrás regularizarlas en el módulo <em>Contratos pendientes</em>.
              </p>
            </div>
          </div>

          {/* Items Table / List */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-semibold text-slate-600 flex justify-between">
              <span>Archivo e identificación</span>
              <span>Cliente y cédula</span>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {items.map((item, idx) => (
                <div key={`${item.fileName}-${idx}`} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50">
                  <div className="min-w-0">
                    <span className="font-semibold text-blue-900 block truncate">{item.tc || item.identifier}</span>
                    <span className="text-[11px] text-slate-500 font-mono block truncate">{item.fileName}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-medium text-slate-800 block truncate max-w-[220px]">
                      {item.nombre || "Sin nombre"}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {item.cedula || "Sin cédula"} {item.provincia ? `· ${item.provincia}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancelar y volver a seleccionar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="w-full sm:w-auto rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition flex items-center justify-center gap-1.5"
          >
            <span>Confirmar y procesar ({items.length})</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
