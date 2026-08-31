import { describe, expect, it } from "vitest";
import {
  DispatchConflictError,
  buildSourceRecordKey,
  canCreateDispatch,
  nextTcGuardState,
  normalizeDispatchIdentity,
  assertRedactionOrigin,
} from "../../lib/dispatch-origin";

describe("dispatch provenance invariants", () => {
  it("keeps origin in the row identity so equal TC/cédula/date imports from both sites are distinct", () => {
    const torre = buildSourceRecordKey({ origin: "TORRE_POPULAR", tc: "4111 1111 1111 1111", cedula: "402-3138262-9", dispatchDate: new Date("2026-08-21T00:00:00.000Z") });
    const centro = buildSourceRecordKey({ origin: "CENTRO_ACOPIO", tc: "4111111111111111", cedula: "40231382629", dispatchDate: new Date("2026-08-21T12:00:00.000Z") });
    expect(torre).not.toBe(centro);
    expect(normalizeDispatchIdentity({ origin: "CENTRO_ACOPIO", tc: "4111 1111 1111 1111", cedula: "402-3138262-9", dispatchDate: new Date("2026-08-21T12:00:00.000Z") })).toEqual({ tc: "4111111111111111", cedula: "40231382629", date: "2026-08-21", origin: "CENTRO_ACOPIO" });
  });

  it("rejects a later dispatch for a delivered TC and a second active dispatch globally", () => {
    expect(() => canCreateDispatch({ tc: "4111111111111111", deliveredCardId: "delivered", activeCardId: null })).toThrow(DispatchConflictError);
    expect(() => canCreateDispatch({ tc: "4111111111111111", deliveredCardId: null, activeCardId: "active" })).toThrow("ACTIVE_TC_CONFLICT");
    expect(canCreateDispatch({ tc: "4111111111111111", deliveredCardId: null, activeCardId: null })).toBeUndefined();
  });

  it("clears the active guard on return and preserves a delivered tombstone", () => {
    expect(nextTcGuardState("RETORNADA", "card-1")).toEqual({ activeCardId: null, deliveredCardId: undefined });
    expect(nextTcGuardState("ENTREGADA", "card-2")).toEqual({ activeCardId: null, deliveredCardId: "card-2" });
  });

  it("allows a redaction only when every selected card has the redaction origin", () => {
    expect(() => assertRedactionOrigin("CENTRO_ACOPIO", ["CENTRO_ACOPIO", "CENTRO_ACOPIO"])).not.toThrow();
    expect(() => assertRedactionOrigin("CENTRO_ACOPIO", ["TORRE_POPULAR"])).toThrow("MIXED_DISPATCH_ORIGIN");
    expect(() => assertRedactionOrigin("CENTRO_ACOPIO", [null])).toThrow("MISSING_DISPATCH_ORIGIN");
  });
});
