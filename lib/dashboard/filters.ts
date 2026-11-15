import type { CardProductType } from "@prisma/client";
import { dateRangeParamKey } from "@/lib/date-range-params";

/** Product filter of the dashboard: one product type, or both when ALL. */
export type DashboardProductType = CardProductType | "ALL";

export const DASHBOARD_PRODUCT_TYPES: DashboardProductType[] = ["ALL", "CREDITO", "DEBITO"];

/** Reads the `productType` query value; anything unknown falls back to ALL (no filter). */
export function parseDashboardProductType(raw: string | null | undefined): DashboardProductType {
  const value = String(raw ?? "").trim().toUpperCase();
  return value === "CREDITO" || value === "DEBITO" ? value : "ALL";
}

/** Prisma `where` fragment for the product filter; empty when ALL. */
export function productTypeWhere(productType: DashboardProductType): { productType?: CardProductType } {
  return productType === "ALL" ? {} : { productType };
}

/**
 * Query for drilling from the dashboard into /tarjetas.
 *
 * The dashboard counts the whole `to` day, so the link uses the
 * `date.dispatchDate.from|to` filter (inclusive of its last day). The legacy
 * `from`/`to` params of /tarjetas treat `to` as that day's midnight and would
 * drop every card dispatched on the last day of the range.
 */
export function buildTarjetasDrillDownParams(input: {
  from: string;
  to: string;
  productType: DashboardProductType;
  extra?: Record<string, string>;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (input.from) params.set(dateRangeParamKey("dispatchDate", "from"), input.from);
  if (input.to) params.set(dateRangeParamKey("dispatchDate", "to"), input.to);
  if (input.productType !== "ALL") params.set("productType", input.productType);
  for (const [key, value] of Object.entries(input.extra ?? {})) params.set(key, value);
  return params;
}

export type ZoneShare = { zona: string; count: number };

/**
 * Cards per zone, largest first, with blank zones grouped as "Sin zona" so the
 * zone totals always add up to the cards dispatched in the range.
 */
export function buildZoneBreakdown(rows: Array<{ zona: string | null; count: number }>): ZoneShare[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const zona = row.zona?.trim() || "Sin zona";
    totals.set(zona, (totals.get(zona) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([zona, count]) => ({ zona, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.zona.localeCompare(b.zona));
}
