export type PiiViolation = {
  path: string;
  reason: string;
};

const FORBIDDEN_EXACT_KEYS = new Set([
  "cedula",
  "documento",
  "nombre",
  "name",
  "fullname",
  "tc",
  "pan",
  "cvv",
]);

const FORBIDDEN_KEY_FRAGMENTS = [
  "customer",
  "cliente",
  "cardnumber",
  "tarjeta",
  "direccion",
  "address",
  "telefono",
  "phone",
  "email",
];

function normalizeKey(key: string) {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function keyLooksSensitive(key: string) {
  const normalized = normalizeKey(key);
  return (
    FORBIDDEN_EXACT_KEYS.has(normalized) ||
    FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

function looksLikeDominicanCedula(value: string) {
  return /\b\d{3}[-\s]?\d{7}[-\s]?\d\b/.test(value);
}

function luhnCheck(value: string) {
  let sum = 0;
  let shouldDouble = false;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (Number.isNaN(digit)) return false;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function looksLikePaymentCard(value: string) {
  const candidates = value.match(/\d[\d\s-]{11,}\d/g) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits);
  });
}

function scan(value: unknown, path: string): PiiViolation | null {
  if (typeof value === "string") {
    if (looksLikeDominicanCedula(value)) {
      return { path, reason: "possible_dominican_cedula" };
    }
    if (looksLikePaymentCard(value)) {
      return { path, reason: "possible_payment_card_number" };
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const violation = scan(value[index], `${path}[${index}]`);
      if (violation) return violation;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path === "$" ? `$.${key}` : `${path}.${key}`;
      if (keyLooksSensitive(key)) {
        return { path: childPath, reason: "forbidden_pii_key" };
      }

      const violation = scan(child, childPath);
      if (violation) return violation;
    }
  }

  return null;
}

export function findPiiViolation(value: unknown) {
  return scan(value, "$");
}

export function assertNoRelayPii(value: unknown) {
  const violation = findPiiViolation(value);
  if (violation) {
    throw new Error(`Relay payload contains PII at ${violation.path}: ${violation.reason}`);
  }
}
