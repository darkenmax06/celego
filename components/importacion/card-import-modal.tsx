"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { CardImportPanels } from "@/components/importacion/card-import-panels";

type Props = {
  onClose: () => void;
  /** Called after the server accepted an import file (e.g. to reload the card list). */
  onImported?: () => void;
};

/**
 * Hosts the credit/debit file importers in a wide, scrollable modal opened
 * from the Tarjetas page. Closing (button, Escape, backdrop) is blocked while
 * a file is being uploaded so an in-flight import is never hidden by accident.
 */
export function CardImportModal({ onClose, onImported }: Props) {
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 id={titleId} className="font-semibold text-slate-900">
              Importar tarjetas
            </h3>
            <p className="text-xs text-slate-500">Carga de archivos de tarjetas de crédito y débito</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            title={busy ? "Espera a que termine la importación" : "Cerrar"}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <CardImportPanels onBusyChange={setBusy} onImported={() => onImported?.()} />
        </div>
      </div>
    </div>
  );
}
