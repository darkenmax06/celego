/**
 * Pure display-label derivation for a `RouteItem`'s current outcome, read
 * from `Card.metadata.route.result` (legacy JSON shape).
 *
 * Extracted out of `rutas-client.tsx` (Slice 2) so the relocated
 * route-progress panel can reuse it without importing the whole client
 * component. Slice 4's `lib/route-lifecycle.ts` will later add the typed
 * dual-read (`RouteItem.outcome` column first, this JSON path as fallback);
 * this module only covers the pre-Slice-4 JSON-only read.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type RouteLifecycleLabel = "EN RUTA" | "ACUSE RECIBIDO" | "DEVUELTA A TIENDA";

/**
 * Raw `metadata.route.result` JSON value, defaulting to the literal
 * `"EN_RUTA"` when `metadata`/`metadata.route`/`metadata.route.result` is
 * absent or not a string. Exported (Slice 4a) so `lib/route-lifecycle.ts`
 * — the new server-side dual-read module that prefers the typed `outcome`
 * column and falls back to this same JSON path — reuses this exact
 * traversal instead of duplicating it a third time.
 */
export function readRouteResultFromMetadata(metadata: unknown): string {
  const root = asRecord(metadata);
  const route = asRecord(root.route);
  return typeof route.result === "string" ? route.result : "EN_RUTA";
}

export function getRouteLifecycle(item: { card: { metadata: unknown } }): RouteLifecycleLabel {
  const value = readRouteResultFromMetadata(item.card.metadata);
  if (value === "ACUSE_RECIBIDO") return "ACUSE RECIBIDO";
  if (value === "DEVUELTA_TIENDA") return "DEVUELTA A TIENDA";
  return "EN RUTA";
}
