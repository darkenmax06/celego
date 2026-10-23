/**
 * Calls overhaul: client-safe half of `lib/contact-call.ts`.
 *
 * `lib/contact-call.ts` imports Prisma enums and `lib/urgent-alerts` (which
 * pulls the Prisma client), so client components cannot import it. Everything
 * here is pure and dependency-free; `lib/contact-call.ts` re-exports it so the
 * API keeps a single import path.
 */

export const PHONE_CALL_STATES = [
  "CONTESTA",
  "NO_CONTESTA",
  "APAGADO",
  "BUZON",
  "EQUIVOCADO",
  "NO_EXISTE",
  "OTRO",
] as const;

export type PhoneCallState = (typeof PHONE_CALL_STATES)[number];

export const PHONE_CALL_STATE_LABELS: Record<PhoneCallState, string> = {
  CONTESTA: "Contesta",
  NO_CONTESTA: "No contesta",
  APAGADO: "Apagado",
  BUZON: "Buzón de voz",
  EQUIVOCADO: "Número equivocado",
  NO_EXISTE: "No existe",
  OTRO: "Otro",
};

export function isPhoneCallState(value: unknown): value is PhoneCallState {
  return typeof value === "string" && (PHONE_CALL_STATES as readonly string[]).includes(value);
}

export const CONTACT_RESULTADOS = [
  "CONTACTADA",
  "NO_CONTACTADA",
  "RETORNO_SOLICITADO",
  "TRASLADO_SOLICITADO",
] as const;

export type ContactResultado = (typeof CONTACT_RESULTADOS)[number];

export const CONTACT_RESULTADO_LABELS: Record<ContactResultado, string> = {
  CONTACTADA: "Contactada",
  NO_CONTACTADA: "No contactada",
  RETORNO_SOLICITADO: "Retorno solicitado",
  TRASLADO_SOLICITADO: "Traslado solicitado",
};

export type PhoneCallDetail = {
  numero: string;
  estado?: string | null;
  nota?: string | null;
};

export const NO_CONTACT_PHONES_REQUIRED_MESSAGE =
  "Debe registrar al menos un número para marcar como no contactada";
export const NO_CONTACT_PHONE_DETAIL_MESSAGE =
  "Todos los números deben tener un estado o nota para marcar como no contactada";

/** Phones (with a number) that still lack both an estado and a nota. */
export function findIncompleteNoContactPhones(
  phones: PhoneCallDetail[] | null | undefined,
): PhoneCallDetail[] {
  return (phones ?? [])
    .filter((phone) => phone.numero?.trim())
    .filter((phone) => !phone.estado?.trim() && !phone.nota?.trim());
}

/**
 * Validates the per-phone detail required to mark a card as NOT contacted.
 * Returns `null` when valid, or the Spanish error message to send as a 400.
 */
export function validateNoContactPhones(
  phones: PhoneCallDetail[] | null | undefined,
): string | null {
  const list = (phones ?? []).filter((phone) => phone.numero?.trim());
  if (list.length === 0) return NO_CONTACT_PHONES_REQUIRED_MESSAGE;
  return findIncompleteNoContactPhones(list).length ? NO_CONTACT_PHONE_DETAIL_MESSAGE : null;
}

/** Derives the stored `ContactLog.resultado` from the POST flags. Return wins over transfer. */
export function resolveContactResultado(input: {
  contactado: boolean;
  solicitudRetorno?: boolean | null;
  traslado?: boolean | null;
}): ContactResultado {
  if (input.solicitudRetorno) return "RETORNO_SOLICITADO";
  if (input.traslado) return "TRASLADO_SOLICITADO";
  return input.contactado ? "CONTACTADA" : "NO_CONTACTADA";
}
