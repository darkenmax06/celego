type BillingCardKeyInput = {
  id: string;
  dispatchDate: Date | null;
  customerCedula: string;
};

function normalizeCedula(cedula: string) {
  const digits = cedula.replace(/\D/g, "");
  return digits || cedula.trim().toUpperCase();
}

function toUtcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function dedupeBillingCardsByCustomerAndDispatchDate<T extends BillingCardKeyInput>(cards: T[]) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const card of cards) {
    if (!card.dispatchDate) {
      unique.push(card);
      continue;
    }

    const key = `${normalizeCedula(card.customerCedula)}|${toUtcDateKey(card.dispatchDate)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(card);
  }

  return unique;
}
