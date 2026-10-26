/**
 * Calls overhaul: client-safe half of `lib/contact-call.ts`.
 *
 * `lib/contact-call.ts` imports Prisma enums and `lib/urgent-alerts` (which
 * pulls the Prisma client), so client components cannot import it. Everything
 * here is pure and dependency-free; `lib/contact-call.ts` re-exports it so the
 * API keeps a single import path.
 */

import { phoneDigits } from "@/lib/phone";

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

export const CONTACTED_CALL_PHONE_REQUIRED_MESSAGE =
  "Debe marcar al menos un número válido que funcione para registrar la llamada como contactada";
export const CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE =
  "Debe seleccionar el canal de contacto para registrar la llamada como contactada";

const MIN_VALID_PHONE_DIGITS = 7;

/**
 * Validates the prerequisites to register a call as contacted: at least one
 * deduplicated phone that works (>= 7 digits) and a non-empty channel. The
 * phone check comes first. Returns `null` when valid, or the Spanish message.
 */
export function validateContactedCall(input: {
  phones: Array<{ num: string; funciona?: boolean }> | null | undefined;
  canalContacto: string | null | undefined;
  telefonosExplicitEmpty: boolean;
}): string | null {
  if (input.telefonosExplicitEmpty) return CONTACTED_CALL_PHONE_REQUIRED_MESSAGE;

  // Mirror `normalizePhones` deduplication: first occurrence of a number wins.
  const seen = new Set<string>();
  let hasWorkingPhone = false;
  for (const phone of input.phones ?? []) {
    const compact = phone.num.trim().replace(/[^\d+]/g, "") || phone.num.trim();
    if (!compact) continue;
    const key = compact.replace(/\D/g, "") || compact.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const digits = phoneDigits(phone.num);
    if (phone.funciona && digits.length >= MIN_VALID_PHONE_DIGITS) hasWorkingPhone = true;
  }
  if (!hasWorkingPhone) return CONTACTED_CALL_PHONE_REQUIRED_MESSAGE;

  if (!input.canalContacto?.trim()) return CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE;
  return null;
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
