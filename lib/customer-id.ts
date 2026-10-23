/**
 * Customer identifier: a Dominican cedula (9 to 13 digits) or an
 * alphanumeric passport (6 to 20 letters and digits, with at least one of each).
 *
 * Cedulas keep their historical digits-only form so existing keys do not move.
 * Passports keep their letters: reducing "C88C5VWLJ" to "885" would make
 * different passports collide.
 */
export function normalizeCustomerId(value: string): string | null {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/[A-Z]/.test(compact)) {
    return /^[A-Z0-9]{6,20}$/.test(compact) && /\d/.test(compact) ? compact : null;
  }
  return /^\d{9,13}$/.test(compact) && !/^0+$/.test(compact) ? compact : null;
}

export const CUSTOMER_ID_RULE = "cedula de 9 a 13 digitos o pasaporte de 6 a 20 letras y numeros, sin ser solo ceros";
