export const DISPATCH_ORIGINS = ["TORRE_POPULAR", "CENTRO_ACOPIO", "BPD_DEBITO"] as const;
export type DispatchOrigin = (typeof DISPATCH_ORIGINS)[number];

const DISPATCH_ORIGIN_LABELS: Record<DispatchOrigin, string> = {
  TORRE_POPULAR: "Torre Popular",
  CENTRO_ACOPIO: "Centro de acopio",
  BPD_DEBITO: "BPD Débito",
};

/** Human-readable name for a dispatch origin. Safe to use on the client. */
export function dispatchOriginLabel(origin: DispatchOrigin | null | undefined) {
  return origin ? DISPATCH_ORIGIN_LABELS[origin] : "Sin procedencia";
}

export class DispatchConflictError extends Error {
  constructor(public readonly code: "DELIVERED_TC_CONFLICT" | "ACTIVE_TC_CONFLICT") {
    super(code);
    this.name = "DispatchConflictError";
  }
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function utcDay(value: Date) {
  if (Number.isNaN(value.getTime())) throw new Error("INVALID_DISPATCH_DATE");
  return value.toISOString().slice(0, 10);
}

export function normalizeDispatchIdentity(input: {
  origin: DispatchOrigin;
  tc: string;
  cedula: string;
  dispatchDate: Date;
}) {
  const tc = digits(input.tc);
  const cedula = digits(input.cedula);
  if (!/^\d{15,19}$/.test(tc) || /^0+$/.test(tc)) throw new Error("INVALID_TC");
  if (!/^\d{9,13}$/.test(cedula) || /^0+$/.test(cedula)) throw new Error("INVALID_CEDULA");
  return { tc, cedula, date: utcDay(input.dispatchDate), origin: input.origin };
}

export function buildSourceRecordKey(input: {
  origin: DispatchOrigin;
  tc: string;
  cedula: string;
  dispatchDate: Date;
}) {
  const identity = normalizeDispatchIdentity(input);
  return `${identity.origin}|${identity.tc}|${identity.cedula}|${identity.date}`;
}

export function canCreateDispatch(input: {
  tc: string;
  activeCardId: string | null;
  deliveredCardId: string | null;
}) {
  if (input.deliveredCardId) throw new DispatchConflictError("DELIVERED_TC_CONFLICT");
  if (input.activeCardId) throw new DispatchConflictError("ACTIVE_TC_CONFLICT");
}

export function isTerminalCardStatus(status: string) {
  return (
    status === "ENTREGADA" ||
    status === "RETORNADA" ||
    status === "TD_ENTREGADO" ||
    status === "TD_DEVUELTO_NO_LOCALIZADO" ||
    status === "TD_NO_LE_INTERESA" ||
    status === "TD_RETIRADA_EN_OFICINA" ||
    status === "TD_SOLICITADA_POR_ERROR" ||
    status === "TD_ZONA_FUERA_COBERTURA"
  );
}

export function nextTcGuardState(status: string, cardId: string) {
  return status === "ENTREGADA" || status === "TD_ENTREGADO"
    ? { activeCardId: null, deliveredCardId: cardId }
    : { activeCardId: null, deliveredCardId: undefined };
}

export type RedactionAdmission =
  | { ok: true }
  | { ok: false; code: "MISSING_DISPATCH_ORIGIN" | "MIXED_DISPATCH_ORIGIN"; message: string };

/**
 * Decides whether a card may join a redaction draft. A redaction belongs to a
 * single dispatch origin: the first card with an origin fixes it for the draft.
 * Mirrors the server-side 409 in /api/redacciones/generar so the operator finds
 * out while scanning instead of after building the whole list.
 */
export function admitCardIntoRedaction(input: {
  draftOrigin: DispatchOrigin | null;
  cardOrigin: DispatchOrigin | null | undefined;
  cardLabel: string;
}): RedactionAdmission {
  if (!input.cardOrigin) {
    return {
      ok: false,
      code: "MISSING_DISPATCH_ORIGIN",
      message: `La tarjeta ${input.cardLabel} no tiene procedencia registrada y no puede entrar en una redaccion`,
    };
  }
  if (input.draftOrigin && input.cardOrigin !== input.draftOrigin) {
    return {
      ok: false,
      code: "MIXED_DISPATCH_ORIGIN",
      message: `Esta redaccion es de ${dispatchOriginLabel(input.draftOrigin)} y la tarjeta ${input.cardLabel} es de ${dispatchOriginLabel(input.cardOrigin)}. No se pueden mezclar procedencias.`,
    };
  }
  return { ok: true };
}

export function assertRedactionOrigin(
  origin: string,
  cardOrigins: Array<string | null | undefined>,
) {
  if (cardOrigins.some((cardOrigin) => !cardOrigin)) {
    throw new Error("MISSING_DISPATCH_ORIGIN");
  }
  if (cardOrigins.some((cardOrigin) => cardOrigin !== origin)) {
    throw new Error("MIXED_DISPATCH_ORIGIN");
  }
}
