export function toCents(value: number) {
  return Math.round(value * 100);
}

export function fromCents(value: number) {
  return (value / 100).toFixed(2);
}

export function formatCurrencyDOP(cents: number) {
  const amount = cents / 100;
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyUSD(cents: number) {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}
