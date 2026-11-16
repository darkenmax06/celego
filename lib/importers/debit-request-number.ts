/**
 * Debit request numbers (N-SS / NRO_SS) look like `4-14492637802`: a 4, a dash
 * and 11 digits. Bank files sometimes carry spreadsheet residue around it
 * (`4-14492637802+F40A2:A31`) or a corrupt cell (`c`), which used to become a
 * new card with a garbage identity.
 */
const DEBIT_REQUEST_NUMBER_PATTERN = /(?<!\d)4-\d{11}(?!\d)/;

/** The canonical request number found in a raw cell, or null when there is none. */
export function normalizeDebitRequestNumber(raw: unknown): string | null {
  const text = String(raw ?? "").replace(/\s+/g, "");
  const match = text.match(DEBIT_REQUEST_NUMBER_PATTERN);
  return match ? match[0] : null;
}

export function invalidDebitRequestNumberMessage(label: string, raw: unknown) {
  return `${label} invalido: "${String(raw ?? "").trim()}" (se espera el formato 4-XXXXXXXXXXX); se omite la fila`;
}
