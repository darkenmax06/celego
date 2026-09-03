import { describe, expect, it } from "vitest";
import { outcomeDisplayLabel, resolveItemLifecycleLabel, resolveItemOutcome } from "@/lib/route-lifecycle";

/**
 * SDD change `rutas-lotes-redesign` — Slice 4a (task 4.3).
 *
 * `lib/route-lifecycle.ts` is the SERVER-side dual-read module (design D1:
 * typed column is truth, JSON metadata is a dual-write mirror). It absorbs
 * `lib/route-item-lifecycle.ts` (Slice 2)'s JSON-parsing branch via its
 * exported `readRouteResultFromMetadata` rather than duplicating it, and
 * layers typed-column precedence on top: typed column wins when present,
 * JSON `metadata.route.result` is the fallback for pre-migration rows, and
 * `"EN_RUTA"` is the ultimate default. Deliberately domain-agnostic — both
 * `RouteItem` and `LotItem` write the identical `metadata.route.result`
 * shape (per `applyItemResult`/`applyLotItemResult`), so this module serves
 * as the shared server-side read for both, per design's dual-read
 * requirement ("Server-derived lifecycle display").
 */
describe("resolveItemOutcome", () => {
  it("prefers the typed outcome column when present, ignoring metadata entirely", () => {
    expect(resolveItemOutcome("ACUSE_RECIBIDO", { route: { result: "DEVUELTA_TIENDA" } })).toBe(
      "ACUSE_RECIBIDO",
    );
  });

  it("falls back to metadata.route.result when the typed column is null (pre-migration row)", () => {
    expect(resolveItemOutcome(null, { route: { result: "DEVUELTA_TIENDA" } })).toBe("DEVUELTA_TIENDA");
  });

  it("falls back to metadata.route.result when the typed column is undefined", () => {
    expect(resolveItemOutcome(undefined, { route: { result: "ACUSE_RECIBIDO" } })).toBe("ACUSE_RECIBIDO");
  });

  it("defaults to EN_RUTA when neither the typed column nor metadata carry a recognized value", () => {
    expect(resolveItemOutcome(null, {})).toBe("EN_RUTA");
    expect(resolveItemOutcome(null, null)).toBe("EN_RUTA");
  });

  it("ignores an unrecognized typed-column value and falls back to metadata rather than trusting it blindly", () => {
    // Defensive: a typed column is Prisma-enum-constrained in practice, but this
    // function accepts a plain string parameter, so it must not propagate garbage.
    expect(resolveItemOutcome("GARBAGE" as never, { route: { result: "ACUSE_RECIBIDO" } })).toBe(
      "ACUSE_RECIBIDO",
    );
  });
});

describe("outcomeDisplayLabel", () => {
  it("maps every ItemOutcomeValue to its Spanish display label", () => {
    expect(outcomeDisplayLabel("EN_RUTA")).toBe("EN RUTA");
    expect(outcomeDisplayLabel("ACUSE_RECIBIDO")).toBe("ACUSE RECIBIDO");
    expect(outcomeDisplayLabel("DEVUELTA_TIENDA")).toBe("DEVUELTA A TIENDA");
  });
});

describe("resolveItemLifecycleLabel", () => {
  it("combines the typed-column dual-read and the display label for a RouteItem-shaped item", () => {
    const item = { outcome: null, card: { metadata: { route: { result: "DEVUELTA_TIENDA" } } } };
    expect(resolveItemLifecycleLabel(item)).toBe("DEVUELTA A TIENDA");
  });

  it("combines the typed-column dual-read and the display label for a LotItem-shaped item (same shape, different domain)", () => {
    const item = { outcome: "ACUSE_RECIBIDO" as const, card: { metadata: {} } };
    expect(resolveItemLifecycleLabel(item)).toBe("ACUSE RECIBIDO");
  });

  it("defaults to EN RUTA when the item has neither a typed outcome nor metadata", () => {
    const item = { outcome: null, card: { metadata: null } };
    expect(resolveItemLifecycleLabel(item)).toBe("EN RUTA");
  });
});
