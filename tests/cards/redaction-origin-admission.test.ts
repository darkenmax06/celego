import { describe, expect, it } from "vitest";
import { admitCardIntoRedaction, dispatchOriginLabel } from "../../lib/dispatch-origin";

describe("admitCardIntoRedaction", () => {
  it("admits the first card and fixes the draft origin", () => {
    expect(
      admitCardIntoRedaction({ draftOrigin: null, cardOrigin: "CENTRO_ACOPIO", cardLabel: "TC1" }),
    ).toEqual({ ok: true });
  });

  it("admits another card of the same origin", () => {
    expect(
      admitCardIntoRedaction({
        draftOrigin: "TORRE_POPULAR",
        cardOrigin: "TORRE_POPULAR",
        cardLabel: "TC2",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a card from a different origin", () => {
    const result = admitCardIntoRedaction({
      draftOrigin: "CENTRO_ACOPIO",
      cardOrigin: "TORRE_POPULAR",
      cardLabel: "4966018884117862",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.code).toBe("MIXED_DISPATCH_ORIGIN");
    expect(result.message).toContain("Centro de acopio");
    expect(result.message).toContain("Torre Popular");
    expect(result.message).toContain("4966018884117862");
  });

  it("rejects a card without a registered origin, even on an empty draft", () => {
    for (const cardOrigin of [null, undefined]) {
      const result = admitCardIntoRedaction({ draftOrigin: null, cardOrigin, cardLabel: "TC9" });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected rejection");
      expect(result.code).toBe("MISSING_DISPATCH_ORIGIN");
    }
  });

  it("rejects a card without origin when the draft already has one", () => {
    const result = admitCardIntoRedaction({
      draftOrigin: "TORRE_POPULAR",
      cardOrigin: null,
      cardLabel: "TC9",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.code).toBe("MISSING_DISPATCH_ORIGIN");
  });
});

describe("dispatchOriginLabel", () => {
  it("labels both origins and the absent case", () => {
    expect(dispatchOriginLabel("TORRE_POPULAR")).toBe("Torre Popular");
    expect(dispatchOriginLabel("CENTRO_ACOPIO")).toBe("Centro de acopio");
    expect(dispatchOriginLabel(null)).toBe("Sin procedencia");
  });
});
