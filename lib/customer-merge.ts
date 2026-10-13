export type CustomerData = {
  nombre: string;
  telefonosRaw: string | null;
  direccionRaw: string | null;
  provincia: string | null;
  zona: string | null;
};

export type CustomerMergePlan = {
  /** Fields that are safe to write: they were empty before, or only add phone numbers. */
  data: Partial<CustomerData>;
  /** Labels of fields where the stored value differs from the incoming one and was kept. */
  preserved: string[];
};

const FIELD_LABELS = {
  nombre: "nombre",
  direccionRaw: "direccion",
  provincia: "provincia",
  zona: "zona",
} as const;

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function comparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function splitPhoneNumbers(raw: string | null | undefined) {
  return (raw ?? "").match(/\d{7,}/g) ?? [];
}

/**
 * Keeps the stored phone text untouched and appends only the incoming numbers it
 * does not already contain, so no known number (or its original format) is lost.
 */
export function mergePhoneLists(existing: string | null | undefined, incoming: string | null | undefined) {
  const base = clean(existing);
  const known = new Set(splitPhoneNumbers(base));
  const knownDigits = (base ?? "").replace(/\D/g, "");
  const additions: string[] = [];
  for (const phone of splitPhoneNumbers(incoming)) {
    if (known.has(phone) || knownDigits.includes(phone)) continue;
    known.add(phone);
    additions.push(phone);
  }
  const merged = [base, ...additions].filter(Boolean).join(" | ");
  return merged || null;
}

/**
 * Decides how an import may touch an existing customer.
 *
 * An import never replaces a value an operator or an earlier import already
 * stored: empty fields are filled, phone numbers are added, and every other
 * difference is reported in `preserved` so the import summary can say so.
 */
export function planCustomerMerge(existing: CustomerData, incoming: Partial<CustomerData>): CustomerMergePlan {
  const data: Partial<CustomerData> = {};
  const preserved: string[] = [];

  for (const field of ["nombre", "direccionRaw", "provincia", "zona"] as const) {
    const next = clean(incoming[field]);
    if (!next) continue;
    const current = clean(existing[field]);
    if (!current) {
      data[field] = next;
    } else if (comparable(current) !== comparable(next)) {
      preserved.push(FIELD_LABELS[field]);
    }
  }

  const phones = mergePhoneLists(existing.telefonosRaw, incoming.telefonosRaw);
  if (phones && phones !== clean(existing.telefonosRaw)) data.telefonosRaw = phones;

  return { data, preserved };
}
