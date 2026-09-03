import { describe, expect, it } from "vitest";
import { resolveOperativoTab } from "@/lib/rutas-operativo-tab";

/**
 * Slice 2, task 2.3 — the route-progress sub-tab used to live under the
 * "Lotes" module tab as `lotTab === "lotes"`, persisted under the localStorage
 * key `rutas:lot-tab`. That sub-tab's identity moves to
 * `moduleTab === "operativo"` in this slice, and the same storage key is
 * reused for the new `OperativoTab` selector. A returning user's browser may
 * still hold an old value ("lotes" or "seguimiento") under that key, or any
 * other unrecognized/garbage value; `resolveOperativoTab` must coerce every
 * value outside the new domain to the safe default instead of leaving the UI
 * on an unmatched tab (which would render neither panel).
 */
describe("resolveOperativoTab", () => {
  it("passes through a value already in the new domain", () => {
    expect(resolveOperativoTab("progreso")).toBe("progreso");
  });

  it("passes through the default value unchanged", () => {
    expect(resolveOperativoTab("asignacion")).toBe("asignacion");
  });

  it("coerces the stale pre-relocation value 'lotes' to the default", () => {
    expect(resolveOperativoTab("lotes")).toBe("asignacion");
  });

  it("coerces the stale pre-relocation value 'seguimiento' to the default", () => {
    expect(resolveOperativoTab("seguimiento")).toBe("asignacion");
  });

  it("coerces undefined (never hydrated) to the default", () => {
    expect(resolveOperativoTab(undefined)).toBe("asignacion");
  });

  it("coerces null and other garbage values to the default", () => {
    expect(resolveOperativoTab(null)).toBe("asignacion");
    expect(resolveOperativoTab(42)).toBe("asignacion");
    expect(resolveOperativoTab({})).toBe("asignacion");
  });
});
