import { describe, expect, it } from "vitest";
import { resolveReturnReasonPrompt } from "@/lib/return-reason-prompt";

/**
 * SDD change `rutas-lotes-redesign` — Slice 4b (task 4.7).
 *
 * Pure decision logic extracted from `rutas-client.tsx`'s `requestReturnReason`,
 * so the async conversion (sync `window.prompt()` -> `Promise<string | null>`)
 * can be TDD'd without a full jsdom render of the client component. The
 * interim implementation still calls `window.prompt()` directly in the
 * component (wrapped in `Promise.resolve()`, per this batch's explicit
 * scope) — this module only decides what to DO with the raw prompt result,
 * matching `requestReturnReason`'s CURRENT behavior verbatim:
 *  - `null` (user cancelled) -> `{ reason: null }`
 *  - empty/whitespace-only -> `{ reason: "", message: "..." }`
 *  - a real value -> `{ reason: <trimmed>, message: undefined }`
 */
describe("resolveReturnReasonPrompt", () => {
  it("returns a null reason and no message when the prompt was cancelled (window.prompt returned null)", () => {
    expect(resolveReturnReasonPrompt(null)).toEqual({ reason: null, message: undefined });
  });

  it("returns an empty reason with a validation message for an empty string", () => {
    expect(resolveReturnReasonPrompt("")).toEqual({
      reason: "",
      message: "Debes indicar motivo de devolucion para marcar tarjeta retornada",
    });
  });

  it("returns an empty reason with a validation message for a whitespace-only string", () => {
    expect(resolveReturnReasonPrompt("   ")).toEqual({
      reason: "",
      message: "Debes indicar motivo de devolucion para marcar tarjeta retornada",
    });
  });

  it("returns the trimmed reason with no message for a real value", () => {
    expect(resolveReturnReasonPrompt("  direccion incorrecta  ")).toEqual({
      reason: "direccion incorrecta",
      message: undefined,
    });
  });
});
