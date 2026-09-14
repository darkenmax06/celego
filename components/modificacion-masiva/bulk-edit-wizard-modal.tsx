"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { normalizeText } from "@/lib/utils";

export const KEEP = "KEEP";
const NO_MESSENGER = "NONE";

export type BulkEditCard = {
  id: string;
  tc: string;
  provincia: string;
  zona: string;
  isRemote: boolean;
  status: string;
  customer: { nombre: string; cedula: string };
  currentMessenger?: { id: string; nombre: string } | null;
};

export type BulkEditOption = { value: string; label: string };
export type BulkEditProvince = { nombre: string; zona: string };
export type BulkEditMessenger = { id: string; nombre: string; provinciaTrabajo: string | null };

/** Field values chosen in the wizard; `KEEP` means "Mantener valor actual". */
export type BulkEditValues = {
  status: string;
  provincia: string;
  zona: string;
  remote: string;
  returnReason: string;
  messengerId: string;
};

export const INITIAL_BULK_EDIT_VALUES: BulkEditValues = {
  status: KEEP,
  provincia: KEEP,
  zona: KEEP,
  remote: KEEP,
  returnReason: "",
  messengerId: KEEP,
};

export const RETURN_REASON_STATUSES = new Set(["RETORNADA", "DEVUELTA_TIENDA"]);

type FieldChange = { label: string; from: string; to: string };

/** Current -> new value pairs for the fields that actually change on a card. */
export function describeBulkEditChanges(
  card: BulkEditCard,
  values: BulkEditValues,
  messengerNames: Record<string, string>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  if (values.status !== KEEP && values.status !== card.status) {
    changes.push({ label: "Estado", from: card.status, to: values.status });
  }
  if (values.provincia !== KEEP && values.provincia !== card.provincia) {
    changes.push({ label: "Provincia", from: card.provincia || "-", to: values.provincia });
  }
  if (values.zona !== KEEP && values.zona !== card.zona) {
    changes.push({ label: "Zona", from: card.zona || "-", to: values.zona });
  }
  if (values.remote !== KEEP && (values.remote === "YES") !== card.isRemote) {
    changes.push({ label: "Remota", from: card.isRemote ? "SI" : "NO", to: values.remote === "YES" ? "SI" : "NO" });
  }
  const effectiveStatus = values.status === KEEP ? card.status : values.status;
  if (values.status !== KEEP && RETURN_REASON_STATUSES.has(effectiveStatus) && values.returnReason) {
    changes.push({ label: "Motivo de devolución", from: "-", to: values.returnReason });
  }
  if (values.messengerId !== KEEP) {
    const nextId = values.messengerId === NO_MESSENGER ? null : values.messengerId;
    if ((card.currentMessenger?.id ?? null) !== nextId) {
      changes.push({
        label: "Mensajero",
        from: card.currentMessenger?.nombre ?? "Sin mensajero",
        to: nextId ? messengerNames[nextId] ?? nextId : "Sin mensajero",
      });
    }
  }
  return changes;
}

/** Builds the `POST /api/tarjetas/lote/estado` payload; kept fields are omitted. */
export function buildBulkEditPayload(cardIds: string[], values: BulkEditValues) {
  const payload: Record<string, unknown> = { cardIds, note: "Cambio masivo por pistoleo" };
  if (values.status !== KEEP) payload.status = values.status;
  if (values.provincia !== KEEP) payload.provincia = values.provincia;
  if (values.zona !== KEEP) payload.zona = values.zona;
  if (values.remote !== KEEP) payload.isRemote = values.remote === "YES";
  if (values.status !== KEEP && RETURN_REASON_STATUSES.has(values.status)) {
    payload.returnReason = values.returnReason.trim();
  }
  if (values.messengerId !== KEEP) {
    payload.messengerId = values.messengerId === NO_MESSENGER ? null : values.messengerId;
  }
  return payload;
}

type Props = {
  cards: BulkEditCard[];
  statuses: readonly string[];
  zonas: readonly string[];
  provinces: BulkEditProvince[];
  returnReasons: BulkEditOption[];
  messengers: BulkEditMessenger[];
  onClose: () => void;
  /** Receives only the cards that change. Resolves to an error message, or null on success. */
  onApply: (values: BulkEditValues, affectedCardIds: string[]) => Promise<string | null>;
};

const selectClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800";

export function BulkEditWizardModal({
  cards,
  statuses,
  zonas,
  provinces,
  returnReasons,
  messengers,
  onClose,
  onApply,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<0 | 1>(0);
  const [values, setValues] = useState<BulkEditValues>(INITIAL_BULK_EDIT_VALUES);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !applying) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applying, onClose]);

  const needsReturnReason = values.status !== KEEP && RETURN_REASON_STATUSES.has(values.status);
  const messengerNames = useMemo(
    () => Object.fromEntries(messengers.map((item) => [item.id, item.nombre])),
    [messengers],
  );
  const visibleMessengers = useMemo(() => {
    if (values.provincia === KEEP) return messengers;
    const target = normalizeText(values.provincia);
    return messengers.filter((item) => item.provinciaTrabajo && normalizeText(item.provinciaTrabajo) === target);
  }, [messengers, values.provincia]);

  const preview = useMemo(
    () => cards.map((card) => ({ card, changes: describeBulkEditChanges(card, values, messengerNames) })),
    [cards, values, messengerNames],
  );
  const affected = preview.filter((item) => item.changes.length > 0);
  const nothingChosen =
    values.status === KEEP &&
    values.provincia === KEEP &&
    values.zona === KEEP &&
    values.remote === KEEP &&
    values.messengerId === KEEP;

  function update(patch: Partial<BulkEditValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  }

  function goToReview() {
    if (nothingChosen) {
      setError("Elige al menos un campo a modificar");
      return;
    }
    if (needsReturnReason && !values.returnReason.trim()) {
      setError("Debes indicar el motivo de devolución para ese estado");
      return;
    }
    setError(null);
    setStep(1);
  }

  async function confirm() {
    setApplying(true);
    setError(null);
    const result = await onApply(
      values,
      affected.map((item) => item.card.id),
    );
    setApplying(false);
    if (result) setError(result);
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !applying) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 bg-gradient-to-r from-[#0f2544] to-slate-800 px-5 py-3 text-white">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-white/80">
              Actualización masiva · Paso {step + 1} de 2
            </span>
            <h2 id={titleId} className="font-display text-base font-bold leading-tight">
              {step === 0 ? "Elige los cambios" : "Revisa y confirma"} ({cards.length} tarjetas)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="text-xs text-slate-500 sm:col-span-2">
                Cada campo conserva el valor actual de la tarjeta a menos que elijas uno nuevo.
              </p>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Estado
                <select
                  value={values.status}
                  onChange={(event) => {
                    const status = event.target.value;
                    update({ status, ...(RETURN_REASON_STATUSES.has(status) ? {} : { returnReason: "" }) });
                  }}
                  className={selectClass}
                >
                  <option value={KEEP}>Mantener valor actual</option>
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Motivo de devolución
                <select
                  value={values.returnReason}
                  onChange={(event) => update({ returnReason: event.target.value })}
                  disabled={!needsReturnReason}
                  className={`${selectClass} disabled:bg-slate-100 disabled:text-slate-400`}
                >
                  <option value="">
                    {needsReturnReason ? "Selecciona un motivo..." : "Solo para RETORNADA / DEVUELTA_TIENDA"}
                  </option>
                  {returnReasons.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Provincia
                <select
                  value={values.provincia}
                  onChange={(event) => {
                    const provincia = event.target.value;
                    if (provincia === KEEP) {
                      update({ provincia, zona: KEEP });
                      return;
                    }
                    const province = provinces.find((item) => item.nombre === provincia);
                    update({ provincia, ...(province ? { zona: province.zona } : {}) });
                  }}
                  className={selectClass}
                >
                  <option value={KEEP}>Mantener valor actual</option>
                  {provinces.map((item) => (
                    <option key={item.nombre} value={item.nombre}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Zona
                <select value={values.zona} onChange={(event) => update({ zona: event.target.value })} className={selectClass}>
                  <option value={KEEP}>Mantener valor actual</option>
                  {zonas.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Remota
                <select value={values.remote} onChange={(event) => update({ remote: event.target.value })} className={selectClass}>
                  <option value={KEEP}>Mantener valor actual</option>
                  <option value="YES">Sí</option>
                  <option value="NO">No</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mensajero
                <select
                  value={values.messengerId}
                  onChange={(event) => update({ messengerId: event.target.value })}
                  className={selectClass}
                >
                  <option value={KEEP}>Mantener valor actual</option>
                  <option value={NO_MESSENGER}>Sin mensajero (quitar asignación)</option>
                  {visibleMessengers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                      {item.provinciaTrabajo ? ` — ${item.provinciaTrabajo}` : ""}
                    </option>
                  ))}
                </select>
                {values.messengerId !== KEEP && values.messengerId !== NO_MESSENGER ? (
                  <span className="block text-[11px] font-normal normal-case tracking-normal text-amber-700">
                    Las tarjetas saldrán de las rutas pendientes o en proceso de otros mensajeros.
                  </span>
                ) : null}
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <strong>{affected.length}</strong> de {cards.length} tarjetas cambiarán.
                {cards.length - affected.length > 0
                  ? ` ${cards.length - affected.length} ya tienen esos valores y no se modificarán.`
                  : ""}
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">TC</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Cambios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affected.map(({ card, changes }) => (
                      <tr key={card.id} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2 font-mono font-bold text-blue-700">{card.tc}</td>
                        <td className="px-3 py-2">
                          <span className="block font-medium text-slate-800">{card.customer.nombre}</span>
                          <span className="block text-slate-400">{card.customer.cedula}</span>
                        </td>
                        <td className="px-3 py-2">
                          <ul className="space-y-1">
                            {changes.map((change) => (
                              <li key={change.label} className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-slate-600">{change.label}:</span>
                                {change.label === "Estado" ? (
                                  <>
                                    <StatusBadge value={change.from} />
                                    <ArrowRight className="h-3 w-3 text-slate-400" />
                                    <StatusBadge value={change.to} />
                                  </>
                                ) : (
                                  <>
                                    <span className="text-slate-500 line-through">{change.from}</span>
                                    <ArrowRight className="h-3 w-3 text-slate-400" />
                                    <span className="font-semibold text-slate-900">{change.to}</span>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                    {!affected.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                          Ninguna tarjeta cambia con estos valores.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {error ? <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
          {step === 0 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={goToReview}
                className="rounded-lg bg-[#0f2544] px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#1a3860]"
              >
                Revisar cambios
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(0)}
                disabled={applying}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={applying || !affected.length}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f2544] px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#1a3860] disabled:opacity-50"
              >
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {applying ? "Aplicando..." : `Confirmar y aplicar (${affected.length})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
