/**
 * Presentation-layer placeholders for missing data.
 *
 * The database stores `null` when a source file leaves a cell empty (the Centro
 * de Acopio dispatch format omits many columns that Torre Popular provides).
 * `null` keeps queries and aggregations honest; these helpers are the only place
 * that turns absence into something a human reads. Never persist their output.
 */

export const NOT_AVAILABLE = "N/A";

/** Digit widths used when a numeric field must render as a zero sequence. */
export const DIGIT_PLACEHOLDER_LENGTH = {
  phone: 10,
  cedula: 11,
  cardNumber: 16,
} as const;

function isBlank(value: string | null | undefined): value is null | undefined | "" {
  return value === null || value === undefined || value.trim() === "";
}

/** Renders a textual field, falling back to `N/A` when there is no value. */
export function displayText(value: string | null | undefined) {
  return isBlank(value) ? NOT_AVAILABLE : value.trim();
}

/** Renders a numeric field as a zero sequence of `length` when there is no value. */
export function displayDigits(value: string | null | undefined, length: number) {
  return isBlank(value) ? "0".repeat(length) : value.trim();
}

/** Renders a phone number, falling back to a zero sequence. */
export function displayPhone(value: string | null | undefined) {
  return displayDigits(value, DIGIT_PLACEHOLDER_LENGTH.phone);
}
