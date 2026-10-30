import type { CardProductType } from "@prisma/client";

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
