import { describe, expect, it } from "vitest";
import { getRouteLifecycle, readRouteResultFromMetadata } from "@/lib/route-item-lifecycle";

/**
 * Slice 2 extraction — `getRouteLifecycle` moves out of `rutas-client.tsx` so
 * the relocated route-progress panel (task 2.2) can reuse it without pulling
 * in the whole client component. Pure function, no behavior change from the
 * original inline implementation.
 */
describe("getRouteLifecycle", () => {
  it("reads ACUSE_RECIBIDO from metadata.route.result", () => {
    const item = { card: { metadata: { route: { result: "ACUSE_RECIBIDO" } } } };
    expect(getRouteLifecycle(item)).toBe("ACUSE RECIBIDO");
  });

  it("reads DEVUELTA_TIENDA from metadata.route.result", () => {
    const item = { card: { metadata: { route: { result: "DEVUELTA_TIENDA" } } } };
    expect(getRouteLifecycle(item)).toBe("DEVUELTA A TIENDA");
  });

  it("defaults to EN RUTA for an explicit EN_RUTA result", () => {
    const item = { card: { metadata: { route: { result: "EN_RUTA" } } } };
    expect(getRouteLifecycle(item)).toBe("EN RUTA");
  });

  it("defaults to EN RUTA when metadata.route is missing entirely", () => {
    const item = { card: { metadata: {} } };
    expect(getRouteLifecycle(item)).toBe("EN RUTA");
  });

  it("defaults to EN RUTA when metadata is null", () => {
    const item = { card: { metadata: null } };
    expect(getRouteLifecycle(item)).toBe("EN RUTA");
  });

  it("defaults to EN RUTA for an unrecognized result value", () => {
    const item = { card: { metadata: { route: { result: "SOMETHING_ELSE" } } } };
    expect(getRouteLifecycle(item)).toBe("EN RUTA");
  });
});

/**
 * Slice 4a extraction: the raw JSON-traversal branch is exported so
 * `lib/route-lifecycle.ts` (the new server-side dual-read module) can reuse
 * it as its typed-column-absent fallback instead of duplicating this same
 * `metadata.route.result` walk a third time.
 */
describe("readRouteResultFromMetadata", () => {
  it("returns the raw metadata.route.result string, unmapped to a display label", () => {
    expect(readRouteResultFromMetadata({ route: { result: "ACUSE_RECIBIDO" } })).toBe("ACUSE_RECIBIDO");
    expect(readRouteResultFromMetadata({ route: { result: "DEVUELTA_TIENDA" } })).toBe("DEVUELTA_TIENDA");
  });

  it("defaults to the literal 'EN_RUTA' when metadata.route is missing or metadata is null", () => {
    expect(readRouteResultFromMetadata({})).toBe("EN_RUTA");
    expect(readRouteResultFromMetadata(null)).toBe("EN_RUTA");
  });
});
