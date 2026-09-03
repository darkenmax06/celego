"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * SDD contrato-tarjetas-pistoleo (spec: pending-contract-workqueue).
 *
 * Two resolution flows for a card stuck in a contract exception status,
 * mirroring the `card-detail-modal.tsx` / `operative-contact-wizard.tsx`
 * nested-modal pattern:
 *  - ENTREGA_DIGITAL_SIN_CONTRATO: client info + a dropzone to upload the
 *    `(C)` contract image, calling the SAME resolution mechanism as the
 *    digital delivery intake, scoped to a single card. This is the ONLY way
 *    to resolve this status.
 *  - ENTREGA_SIN_CONTRATO: client info + a "mark as delivered" button that
 *    transitions the card to ACUSE_RECIBIDO and triggers printing the
 *    single-card delivery relación.
 */

export type ContratoPendienteCard = {
  id: string;
  tc: string;
  status: "ENTREGA_DIGITAL_SIN_CONTRATO" | "ENTREGA_SIN_CONTRATO";
  provincia: string;
  contractImageAt: string | null;
  customer: {
    nombre: string;
    cedula: string;
    telefonosRaw: string | null;
  };
};

type Props = {
  card: ContratoPendienteCard;
  onClose: () => void;
  onResolved: () => void;
};

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export function ContratoPendienteWizard({ card, onClose, onResolved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadContract() {
    if (!file) {
      setMessage("Selecciona la imagen de contrato (C) antes de continuar");
      return;
    }
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/contratos-pendientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, action: "SUBIR_CONTRATO", fileName: file.name }),
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(json.error ?? "No se pudo registrar la imagen de contrato");
      setSaving(false);
      return;
    }

    setSaving(false);
    onResolved();
  }

  async function markDelivered() {
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/contratos-pendientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, action: "MARCAR_ENTREGADO" }),
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(json.error ?? "No se pudo confirmar la entrega");
      setSaving(false);
      return;
    }

    setSaving(false);
    window.open(`/api/rutas/export?cardId=${card.id}&format=pdf`, "_blank", "noopener,noreferrer");
    onResolved();
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {card.status === "ENTREGA_DIGITAL_SIN_CONTRATO" ? "Subir imagen de contrato" : "Confirmar entrega"}
            </h2>
            <p className="text-sm text-slate-500">TC {card.tc}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <InfoItem label="Cliente" value={card.customer.nombre} />
          <InfoItem label="Cédula" value={card.customer.cedula} />
          <InfoItem label="Teléfonos" value={card.customer.telefonosRaw ?? "-"} />
          <InfoItem label="Provincia" value={card.provincia} />
        </div>

        {card.status === "ENTREGA_DIGITAL_SIN_CONTRATO" ? (
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) setFile(dropped);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm ${
                dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50"
              }`}
            >
              <p className="text-slate-600">Arrastra la imagen del contrato (con etiqueta &quot;(C)&quot;) aquí</p>
              <p className="my-2 text-xs text-slate-400">o</p>
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Seleccionar archivo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {file ? <p className="mt-3 text-xs font-medium text-slate-700">{file.name}</p> : null}
            </div>

            {message ? <p className="text-sm text-rose-600">{message}</p> : null}

            <button
              type="button"
              onClick={uploadContract}
              disabled={saving || !file}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Registrar imagen de contrato"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {message ? <p className="text-sm text-rose-600">{message}</p> : null}
            <button
              type="button"
              onClick={markDelivered}
              disabled={saving}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Marcar como entregada e imprimir relación"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
