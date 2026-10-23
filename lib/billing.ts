import { normalizeCustomerId } from "./customer-id";

type BillingCardKeyInput = {
  id: string;
  dispatchDate: Date | null;
  customerCedula: string;
  isAdditional?: boolean;
  productType: "CREDITO" | "DEBITO";
};

function normalizeCedula(cedula: string) {
  return normalizeCustomerId(cedula) ?? (cedula.replace(/\D/g, "") || cedula.trim().toUpperCase());
}

function toUtcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function dedupeBillingCardsByCustomerAndDispatchDate<T extends BillingCardKeyInput>(cards: T[]) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const card of cards) {
    if (card.isAdditional) {
      continue;
    }

    if (!card.dispatchDate) {
      unique.push(card);
      continue;
    }

    const key = `${card.productType}|${normalizeCedula(card.customerCedula)}|${toUtcDateKey(card.dispatchDate)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(card);
  }

  return unique;
}

export type BillingProductType = "CREDITO" | "DEBITO";

type BillingTariff = {
  productType: BillingProductType;
  zona: string;
  active: boolean;
  baseCents: number;
  ranges: Array<{ minQty: number; maxQty: number | null; centsPerCard: number }>;
};

export class MissingBillingTariffError extends Error {
  constructor(public readonly productType: BillingProductType, public readonly zona: string) {
    super(`Configura una tarifa activa de ${productType === "DEBITO" ? "débito" : "crédito"} para la zona ${zona} antes de facturar.`);
  }
}

export function calculateBilling(
  cards: Array<BillingCardKeyInput & { productType: BillingProductType; zona: string; isRemote: boolean }>,
  tariffs: BillingTariff[],
  fxRate: number,
) {
  const billableCards = dedupeBillingCardsByCustomerAndDispatchDate(cards);
  const tariffMap = new Map(tariffs.filter((t) => t.active).map((t) => [`${t.productType}|${t.zona}`, t]));
  const groups = new Map<string, { productType: BillingProductType; zona: string; qty: number; isRemoteSurcharge: boolean }>();
  for (const card of billableCards) {
    for (const zona of card.isRemote ? [card.zona, "REMOTA"] : [card.zona]) {
      const key = `${card.productType}|${zona}`;
      const group = groups.get(key) ?? { productType: card.productType, zona, qty: 0, isRemoteSurcharge: zona === "REMOTA" };
      group.qty++;
      groups.set(key, group);
    }
  }
  const zones = ["Metro", "Este", "Norte", "Sur", "REMOTA"];
  const items = Array.from(groups.values()).sort((a, b) => {
    if (a.productType !== b.productType) return a.productType === "CREDITO" ? -1 : 1;
    return (zones.indexOf(a.zona) < 0 ? 99 : zones.indexOf(a.zona)) - (zones.indexOf(b.zona) < 0 ? 99 : zones.indexOf(b.zona)) || a.zona.localeCompare(b.zona);
  }).map((group) => {
    const tariff = tariffMap.get(`${group.productType}|${group.zona}`);
    if (!tariff) throw new MissingBillingTariffError(group.productType, group.zona);
    const range = tariff.ranges.find((r) => group.qty >= r.minQty && (r.maxQty === null || group.qty <= r.maxQty));
    const unitUsdCents = range?.centsPerCard ?? tariff.baseCents;
    const totalUsdCents = unitUsdCents * group.qty;
    const additionalExcluded = cards.filter((card) => card.isAdditional && card.productType === group.productType && (group.isRemoteSurcharge ? card.isRemote : card.zona === group.zona)).length;
    return { ...group, additionalExcluded, unitUsdCents, totalUsdCents, totalDopCents: Math.round(totalUsdCents * fxRate) };
  });
  return {
    items,
    totalEntregas: billableCards.length,
    additionalExcluded: cards.filter((c) => c.isAdditional).length,
    totalUsdCents: items.reduce((sum, item) => sum + item.totalUsdCents, 0),
    totalDopCents: items.reduce((sum, item) => sum + item.totalDopCents, 0),
  };
}
