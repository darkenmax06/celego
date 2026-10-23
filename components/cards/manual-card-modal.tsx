"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PROVINCIAS_INICIALES } from "@/lib/constants";

type Props = {
  onClose: () => void;
  onCreated: (message: string) => void;
};

type FormState = {
  tc: string;
  cedula: string;
  nombre: string;
  provincia: string;
  telefonos: string;
  direccion: string;
  dispatchDate: string;
  origin: "TORRE_POPULAR" | "CENTRO_ACOPIO";
  isRemote: boolean;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

const FIELD = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold text-slate-600";

/**
 * Manual credit-card entry. The server applies the same rules as the file
 * import (TC/cedula format, duplicate and active-TC guards) and answers with
 * the exact reason when it refuses, so the message is shown as received.
 */
export function ManualCardModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormState>({
    tc: "",
    cedula: "",
    nombre: "",
    provincia: "",
    telefonos: "",
    direccion: "",
    dispatchDate: today(),
    origin: "TORRE_POPULAR",
    isRemote: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/tarjetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productType: "CREDITO",
          tc: form.tc,
          cedula: form.cedula,
          nombre: form.nombre,
          provincia: form.provincia,
          telefonos: form.telefonos || undefined,
          direccion: form.direccion || undefined,
          dispatchDate: form.dispatchDate || undefined,
          origin: form.origin,
          isRemote: form.isRemote,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; preservedCustomerFields?: string[] };
      if (!response.ok) {
        setError(data.error ?? `No se pudo crear la tarjeta (código ${response.status})`);
        return;
      }
      const kept = data.preservedCustomerFields?.length
        ? ` Datos del cliente existentes conservados sin sobrescribir: ${data.preservedCustomerFields.join(", ")}.`
        : "";
      onCreated(`Tarjeta ${form.tc} creada.${kept}`);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Nueva tarjeta de crédito</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <label className={LABEL}>
            Número de tarjeta (TC)
            <input required inputMode="numeric" value={form.tc} onChange={(e) => set("tc", e.target.value)} className={FIELD} placeholder="15 a 19 dígitos" />
          </label>
          <label className={LABEL}>
            Cédula
            <input required value={form.cedula} onChange={(e) => set("cedula", e.target.value)} className={FIELD} placeholder="Cédula (9 a 13 dígitos) o pasaporte" />
          </label>
          <label className={`${LABEL} sm:col-span-2`}>
            Nombre del cliente
            <input required value={form.nombre} onChange={(e) => set("nombre", e.target.value)} className={FIELD} />
          </label>
          <label className={LABEL}>
            Provincia
            <input required list="manual-card-provincias" value={form.provincia} onChange={(e) => set("provincia", e.target.value)} className={FIELD} />
            <datalist id="manual-card-provincias">
              {PROVINCIAS_INICIALES.map((province) => (
                <option key={province.nombre} value={province.nombre} />
              ))}
            </datalist>
          </label>
          <label className={LABEL}>
            Fecha de despacho
            <input required type="date" value={form.dispatchDate} onChange={(e) => set("dispatchDate", e.target.value)} className={FIELD} />
          </label>
          <label className={`${LABEL} sm:col-span-2`}>
            Teléfonos (separe varios con coma o salto de línea)
            <textarea rows={2} value={form.telefonos} onChange={(e) => set("telefonos", e.target.value)} className={FIELD} />
          </label>
          <label className={`${LABEL} sm:col-span-2`}>
            Dirección y referencias
            <textarea rows={3} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} className={FIELD} />
          </label>
          <label className={LABEL}>
            Procedencia
            <select value={form.origin} onChange={(e) => set("origin", e.target.value as FormState["origin"])} className={FIELD}>
              <option value="TORRE_POPULAR">Torre Popular</option>
              <option value="CENTRO_ACOPIO">Centro de acopio</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={form.isRemote} onChange={(e) => set("isRemote", e.target.checked)} />
            Zona remota
          </label>

          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700 sm:col-span-2">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Creando..." : "Crear tarjeta"}
          </button>
        </div>
      </form>
    </div>
  );
}
