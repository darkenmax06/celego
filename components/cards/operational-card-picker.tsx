"use client";

import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type OperationalCard = {
  id: string;
  tc: string;
  status: string;
  dispatchDate: string | null;
  createdAt: string | null;
  returnReason: string | null;
  customer: {
    nombre: string;
    cedula: string;
  };
  externalReference: string | null;
  dispatchOrigin: "TORRE_POPULAR" | "CENTRO_ACOPIO" | null;
  isRemote: boolean;
  zona: string;
  provincia?: string | null;
};

export type OperationalSearchResult =
  | { kind: "RESUELTA"; card: OperationalCard }
  | { kind: "REQUIERE_SELECCION"; options: OperationalCard[] }
  | { kind: "SOLO_CERRADAS"; closedCards: OperationalCard[] }
  | { kind: "NO_ENCONTRADA" };

type PickerDialog =
  | { kind: "selection"; cards: OperationalCard[] }
  | { kind: "closed"; cards: OperationalCard[] };

type OperationalCardPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onCardSelected: (card: OperationalCard) => void;
  onCardsSelected?: (cards: OperationalCard[]) => void;
  onMessage?: (message: string) => void;
  placeholder?: string;
  buttonLabel?: string;
  inputLabel?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOperationalCard(value: unknown): value is OperationalCard {
  if (!isRecord(value) || !isRecord(value.customer)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.tc === "string" &&
    typeof value.status === "string" &&
    typeof value.customer.nombre === "string" &&
    typeof value.customer.cedula === "string"
  );
}

function asCards(value: unknown): OperationalCard[] {
  return Array.isArray(value) ? value.filter(isOperationalCard) : [];
}

function parseOperationalResult(payload: unknown): OperationalSearchResult | null {
  if (!isRecord(payload)) return null;

  const nested = isRecord(payload.data) ? payload.data.result : undefined;
  const result = payload.result ?? nested;
  if (!isRecord(result) || typeof result.kind !== "string") return null;

  if (result.kind === "RESUELTA" && isOperationalCard(result.card)) {
    return { kind: "RESUELTA", card: result.card };
  }
  if (result.kind === "REQUIERE_SELECCION") {
    return {
      kind: "REQUIERE_SELECCION",
      options: asCards(result.options ?? result.cards),
    };
  }
  if (result.kind === "SOLO_CERRADAS") {
    return {
      kind: "SOLO_CERRADAS",
      closedCards: asCards(result.closedCards ?? result.cards),
    };
  }
  if (result.kind === "NO_ENCONTRADA") return { kind: "NO_ENCONTRADA" };

  return null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-DO");
}

function cardDescription(card: OperationalCard) {
  return `${card.tc}, ${card.customer.nombre}, cedula ${card.customer.cedula}`;
}

export function OperationalCardPicker({
  value,
  onValueChange,
  onCardSelected,
  onCardsSelected,
  onMessage,
  placeholder = "Pistolear TC/Cedula y presionar Enter",
  buttonLabel = "Agregar",
  inputLabel = "Buscar tarjeta operativa",
  autoFocus = false,
  disabled = false,
  className,
}: OperationalCardPickerProps) {
  const inputId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<PickerDialog | null>(null);
  const [selectedClosedCardId, setSelectedClosedCardId] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!dialog) return;

    priorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDialog(null);
        setSelectedClosedCardId("");
      }
    };

    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      priorFocusRef.current?.focus();
    };
  }, [dialog]);

  function publishMessage(message: string) {
    setFeedback(message);
    onMessage?.(message);
  }

  function closeDialog() {
    setDialog(null);
    setSelectedClosedCardId("");
  }

  function selectCard(card: OperationalCard) {
    onCardSelected(card);
    onValueChange("");
    setFeedback("");
    closeDialog();
  }

  async function search() {
    const raw = value.trim();
    if (!raw || isSearching || disabled) return;

    // Detect if input contains multiple identifiers (separated by newline, comma, semicolon, or whitespace)
    const tokens = raw
      .split(/[\n,;]+/g)
      .map((t) => t.trim())
      .filter(Boolean);

    if (!tokens.length) return;

    setIsSearching(true);
    setFeedback("");

    // If multiple tokens entered: use batch search endpoint
    if (tokens.length > 1) {
      try {
        const response = await fetch("/api/tarjetas/busqueda-operativa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifiers: tokens }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload || !Array.isArray(payload.results)) {
          publishMessage("No se pudieron resolver las tarjetas ingresadas");
          return;
        }

        const resolvedCards: OperationalCard[] = [];
        const notFound: string[] = [];
        const ambiguous: string[] = [];

        for (const item of payload.results) {
          const res = item.resolution;
          if (res?.kind === "RESUELTA" && isOperationalCard(res.card)) {
            resolvedCards.push(res.card);
          } else if (res?.kind === "NO_ENCONTRADA") {
            notFound.push(item.identifier);
          } else {
            ambiguous.push(item.identifier);
          }
        }

        if (resolvedCards.length > 0) {
          if (onCardsSelected) {
            onCardsSelected(resolvedCards);
          } else {
            for (const c of resolvedCards) {
              onCardSelected(c);
            }
          }
          onValueChange("");
          let msg = `Se agregaron ${resolvedCards.length} tarjetas.`;
          if (notFound.length > 0) {
            msg += ` No encontradas: ${notFound.slice(0, 3).join(", ")}${notFound.length > 3 ? "..." : ""}.`;
          }
          if (ambiguous.length > 0) {
            msg += ` Requieren selección individual: ${ambiguous.slice(0, 3).join(", ")}.`;
          }
          publishMessage(msg);
        } else {
          publishMessage("No se encontraron tarjetas válidas con los datos ingresados");
        }
      } catch {
        publishMessage("Error al procesar la búsqueda en lote");
      } finally {
        setIsSearching(false);
      }
      return;
    }

    // Single token lookup
    const query = tokens[0];
    try {
      const response = await fetch(`/api/tarjetas/busqueda-operativa?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "No se pudo buscar la tarjeta";
        publishMessage(message);
        return;
      }

      const result = parseOperationalResult(payload);
      if (!result) {
        publishMessage("La busqueda operativa devolvio una respuesta no valida");
        return;
      }

      if (result.kind === "RESUELTA") {
        selectCard(result.card);
        return;
      }
      if (result.kind === "REQUIERE_SELECCION") {
        if (!result.options.length) {
          publishMessage("No hay tarjetas vigentes disponibles para seleccionar");
          return;
        }
        setDialog({ kind: "selection", cards: result.options });
        return;
      }
      if (result.kind === "SOLO_CERRADAS") {
        if (!result.closedCards.length) {
          publishMessage("No hay tarjetas cerradas disponibles para seleccionar");
          return;
        }
        setSelectedClosedCardId("");
        setDialog({ kind: "closed", cards: result.closedCards });
        return;
      }

      publishMessage("No se encontro tarjeta para ese TC o cedula");
    } catch {
      publishMessage("No se pudo buscar la tarjeta. Intenta nuevamente.");
    } finally {
      setIsSearching(false);
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void search();
  }

  const selectedClosedCard =
    dialog?.kind === "closed"
      ? dialog.cards.find((card) => card.id === selectedClosedCardId) ?? null
      : null;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3",
          className,
        )}
      >
        <span aria-hidden="true" className="text-lg text-blue-700">
          O
        </span>
        <label className="sr-only" htmlFor={inputId}>
          {inputLabel}
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(event) => {
            setFeedback("");
            onValueChange(event.target.value);
          }}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none"
          autoFocus={autoFocus}
          disabled={disabled || isSearching}
          aria-describedby={feedback ? `${inputId}-feedback` : undefined}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={disabled || isSearching || !value.trim()}
          className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSearching ? "Buscando..." : buttonLabel}
        </button>
      </div>

      {feedback ? (
        <p id={`${inputId}-feedback`} role="status" className="mt-2 text-sm text-rose-700">
          {feedback}
        </p>
      ) : null}

      {dialog ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/35 px-4 py-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            tabIndex={-1}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-blue-700">BUSQUEDA OPERATIVA</p>
                <h2 id={dialogTitleId} className="mt-1 font-display text-xl font-bold text-slate-900">
                  {dialog.kind === "selection"
                    ? "Selecciona la tarjeta vigente"
                    : "Solo hay tarjetas cerradas"}
                </h2>
                <p id={dialogDescriptionId} className="mt-1 text-sm text-slate-600">
                  {dialog.kind === "selection"
                    ? "Hay mas de una tarjeta vigente. Elige explicitamente cual usar."
                    : "Estas tarjetas fueron retornadas o devueltas a tienda. Confirma una seleccion antes de continuar."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
                aria-label="Cerrar selector de tarjeta"
              >
                X
              </button>
            </div>

            <div className="space-y-3 p-5">
              {dialog.kind === "selection" ? (
                dialog.cards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => selectCard(card)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                    aria-label={`Seleccionar ${cardDescription(card)}`}
                  >
                    <CardCandidateSummary card={card} />
                  </button>
                ))
              ) : (
                <fieldset className="space-y-3">
                  <legend className="sr-only">Elegir una tarjeta cerrada para confirmar</legend>
                  {dialog.cards.map((card) => {
                    const inputId = `${dialogTitleId}-${card.id}`;
                    return (
                      <label
                        key={card.id}
                        htmlFor={inputId}
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-xl border p-4 transition",
                          selectedClosedCardId === card.id
                            ? "border-amber-400 bg-amber-50"
                            : "border-slate-200 bg-white hover:border-slate-300",
                        )}
                      >
                        <input
                          id={inputId}
                          type="radio"
                          name={`${dialogTitleId}-closed-card`}
                          value={card.id}
                          checked={selectedClosedCardId === card.id}
                          onChange={() => setSelectedClosedCardId(card.id)}
                          className="mt-1 h-4 w-4 shrink-0 accent-[#0f2544]"
                        />
                        <span className="min-w-0 flex-1">
                          <CardCandidateSummary card={card} />
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              {dialog.kind === "closed" ? (
                <button
                  type="button"
                  disabled={!selectedClosedCard}
                  onClick={() => {
                    if (selectedClosedCard) selectCard(selectedClosedCard);
                  }}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirmar tarjeta cerrada
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CardCandidateSummary({ card }: { card: OperationalCard }) {
  return (
    <span className="block">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-blue-700">TC {card.tc}</span>
        <div className="flex items-center gap-1.5">
          {card.dispatchOrigin === "TORRE_POPULAR" ? (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-bold text-blue-800">
              🏛️ Torre Popular
            </span>
          ) : card.dispatchOrigin === "CENTRO_ACOPIO" ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">
              📦 Centro de acopio
            </span>
          ) : (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
              ⚠️ Sin procedencia
            </span>
          )}
          <StatusBadge value={card.status} />
        </div>
      </span>
      <span className="mt-2 block text-sm font-medium text-slate-900">{card.customer.nombre}</span>
      <span className="mt-0.5 block text-sm text-slate-600">Cedula: {card.customer.cedula}</span>
      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Despacho: {formatDate(card.dispatchDate)}</span>
        {card.externalReference ? <span>Referencia: {card.externalReference}</span> : null}
        {card.zona ? <span>Zona: {card.zona}</span> : null}
      </span>
      {card.returnReason ? (
        <span className="mt-2 block text-xs font-medium text-rose-700">
          Motivo de devolucion: {card.returnReason}
        </span>
      ) : null}
    </span>
  );
}
