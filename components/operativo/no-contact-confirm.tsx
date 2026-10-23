"use client";

import { AlertTriangle, X } from "lucide-react";
import { PhoneEstadoSelect } from "@/components/operativo/phone-estado-select";
import { findIncompleteNoContactPhones, NO_CONTACT_PHONES_REQUIRED_MESSAGE } from "@/lib/contact-call-shared";

export type NoContactPhone = { num: string; estado?: string; comentario?: string };

type Props = {
  phones: NoContactPhone[];
  motivo: string;
  saving: boolean;
  error?: string;
  onEstadoChange: (index: number, estado: string) => void;
  onNotaChange: (index: number, nota: string) => void;
  onMotivoChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Calls overhaul: confirmation step before marking a card as NOT contacted.
 * Mirrors the API rule (`validateNoContactPhones`): every phone needs an
 * estado or a nota, so the confirm button stays disabled and the missing
 * phones are highlighted until that holds. `motivo` is sent as
 * `motivoNoContacto`.
 */
export function NoContactConfirm({
  phones,
  motivo,
  saving,
  error,
  onEstadoChange,
  onNotaChange,
  onMotivoChange,
  onCancel,
  onConfirm,
}: Props) {
  const rows = phones.map((phone, index) => ({ phone, index })).filter(({ phone }) => phone.num.trim());
  const incomplete = new Set(
    findIncompleteNoContactPhones(
      rows.map(({ phone }) => ({ numero: phone.num, estado: phone.estado, nota: phone.comentario })),
    ).map((item) => item.numero),
  );
  const blocked = rows.length === 0 || incomplete.size > 0;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-contact-confirm-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 id="no-contact-confirm-title" className="font-display text-base font-bold text-slate-900">
            Marcar como no contactada
          </h3>
          <button type="button" onClick={onCancel} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          <p className="text-slate-600">
            Registra el resultado de cada número intentado. Todos deben tener un <strong>estado</strong> o una{" "}
            <strong>nota</strong>.
          </p>

          {rows.length === 0 ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-semibold text-rose-800">
              {NO_CONTACT_PHONES_REQUIRED_MESSAGE}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map(({ phone, index }) => {
                const missing = incomplete.has(phone.num);
                return (
                  <li
                    key={`${phone.num}-${index}`}
                    className={`grid grid-cols-12 items-center gap-2 rounded-xl border p-2 ${
                      missing ? "border-rose-300 bg-rose-50/60" : "border-slate-200"
                    }`}
                  >
                    <span className="col-span-4 font-mono font-semibold text-slate-800">{phone.num}</span>
                    <div className="col-span-4">
                      <PhoneEstadoSelect
                        value={phone.estado ?? ""}
                        onChange={(next) => onEstadoChange(index, next)}
                        label={`Estado del número ${phone.num}`}
                        invalid={missing}
                      />
                    </div>
                    <input
                      type="text"
                      aria-label={`Nota del número ${phone.num}`}
                      value={phone.comentario ?? ""}
                      onChange={(event) => onNotaChange(index, event.target.value)}
                      placeholder="Nota..."
                      className="col-span-4 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {incomplete.size > 0 ? (
            <p role="alert" className="flex items-center gap-1.5 font-semibold text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Falta estado o nota en: {[...incomplete].join(", ")}
            </p>
          ) : null}

          <div>
            <label htmlFor="no-contact-motivo" className="mb-1 block font-bold text-slate-700">
              Comentario adicional
            </label>
            <textarea
              id="no-contact-motivo"
              value={motivo}
              onChange={(event) => onMotivoChange(event.target.value)}
              rows={3}
              placeholder="Ej: Se intentó en horario de la mañana y la tarde"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-semibold text-rose-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || blocked}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Confirmar no contactada
          </button>
        </div>
      </div>
    </div>
  );
}
