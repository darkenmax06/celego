/**
 * Every phone a lot item can be reached at: the customer's current numbers first,
 * then the snapshot saved on the item when the lot was created. The snapshot alone
 * goes stale as soon as the customer gains numbers.
 */
export function lotItemPhoneNumbers(item: {
  telefono: string | null;
  card: { customer: { telefonosRaw?: string | null } } | null;
}) {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const raw of [item.card?.customer.telefonosRaw, item.telefono]) {
    for (const token of (raw ?? "").split(/[|;,\n]+/)) {
      const phone = token.trim();
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 7 || seen.has(digits)) continue;
      seen.add(digits);
      phones.push(phone);
    }
  }
  return phones;
}
