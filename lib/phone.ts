/**
 * Pure phone helpers shared by client and server code.
 *
 * Display formatting (`formatPhoneDisplay`) and WhatsApp conversion
 * (`toWhatsAppNumber`) are intentionally separate: what the agent reads is not
 * always what wa.me needs.
 */

const EXTENSION_MARKER = /\b(ext|x)\.?\s*\d*/i;

/** Digits of a phone, ignoring any extension (`ext 12`, `x12`). */
export function phoneDigits(raw: string): string {
  const match = EXTENSION_MARKER.exec(raw);
  const base = match ? raw.slice(0, match.index) : raw;
  return base.replace(/\D/g, "");
}

/** `000-000-0000` for exactly 10 digits; otherwise the bare digits (or the trimmed raw value). */
export function formatPhoneDisplay(raw: string): string {
  const digits = phoneDigits(raw);
  if (!digits) return raw.trim();
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export type WhatsAppTarget = { ok: true; number: string } | { ok: false; reason: string };

export const WHATSAPP_MISSING_AREA_CODE_REASON = "Falta el código de área";
export const WHATSAPP_UNSUPPORTED_REASON = "Número no compatible con WhatsApp";

const DR_AREA_CODES = ["809", "829", "849"];

export function toWhatsAppNumber(raw: string): WhatsAppTarget {
  const digits = phoneDigits(raw);
  if (digits.length === 10 && DR_AREA_CODES.includes(digits.slice(0, 3))) {
    return { ok: true, number: `1${digits}` };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return { ok: true, number: digits };
  }
  if (digits.length === 7) {
    return { ok: false, reason: WHATSAPP_MISSING_AREA_CODE_REASON };
  }
  return { ok: false, reason: WHATSAPP_UNSUPPORTED_REASON };
}

export function buildWhatsAppUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
