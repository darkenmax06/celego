import { describe, expect, it } from "vitest";
import {
  assertReturnReasonPresent,
  buildOutcomeNote,
  isClosedCardStatus,
  normalizeItemResult,
  outcomeToCardStatus,
  resolveReturnReason,
  shouldLogOutcomeTransition,
} from "@/lib/item-outcome";

/**
 * SDD change `rutas-lotes-redesign` — Slice 4a (task 4.1).
 *
 * Pure result -> outcome -> CardStatus mapping, note-prefix builder, and
 * log-condition predicate, extracted from `applyItemResult`
 * (app/api/rutas/route.ts, `normalizeRouteResult`) and `applyLotItemResult`
 * (app/api/lotes/route.ts, `normalizeLotResult`). Every assertion here is
 * pinned against the CURRENT literal behavior of those two functions,
 * characterized by Slice 1's golden suite
 * (`tests/golden/route-lot-outcome-characterization.test.ts`) — this module
 * must reproduce it exactly so Slice 4b can delegate to it with zero
 * behavior drift.
 */
describe("normalizeItemResult", () => {
  it("maps ROUTE domain results: ENTREGADA and ACUSE_RECIBIDO both collapse to ACUSE_RECIBIDO", () => {
    expect(normalizeItemResult("ROUTE", "ENTREGADA")).toBe("ACUSE_RECIBIDO");
    expect(normalizeItemResult("ROUTE", "ACUSE_RECIBIDO")).toBe("ACUSE_RECIBIDO");
  });

  it("maps ROUTE domain results: RETORNADA and DEVUELTA_TIENDA both collapse to DEVUELTA_TIENDA", () => {
    expect(normalizeItemResult("ROUTE", "RETORNADA")).toBe("DEVUELTA_TIENDA");
    expect(normalizeItemResult("ROUTE", "DEVUELTA_TIENDA")).toBe("DEVUELTA_TIENDA");
  });

  it("defaults ROUTE domain to EN_RUTA for EN_RUTA or any unrecognized value", () => {
    expect(normalizeItemResult("ROUTE", "EN_RUTA")).toBe("EN_RUTA");
    expect(normalizeItemResult("ROUTE", "SOMETHING_ELSE")).toBe("EN_RUTA");
  });

  it("maps LOT domain results: ACUSE_RECIBIDO and RECIBIDA both collapse to ACUSE_RECIBIDO", () => {
    expect(normalizeItemResult("LOT", "ACUSE_RECIBIDO")).toBe("ACUSE_RECIBIDO");
    expect(normalizeItemResult("LOT", "RECIBIDA")).toBe("ACUSE_RECIBIDO");
  });

  it("maps LOT domain results: DEVUELTA_TIENDA and RETORNADA both collapse to DEVUELTA_TIENDA", () => {
    expect(normalizeItemResult("LOT", "DEVUELTA_TIENDA")).toBe("DEVUELTA_TIENDA");
    expect(normalizeItemResult("LOT", "RETORNADA")).toBe("DEVUELTA_TIENDA");
  });

  it("defaults LOT domain to EN_RUTA for EN_RUTA, PENDIENTE, or any unrecognized value", () => {
    expect(normalizeItemResult("LOT", "EN_RUTA")).toBe("EN_RUTA");
    expect(normalizeItemResult("LOT", "PENDIENTE")).toBe("EN_RUTA");
    expect(normalizeItemResult("LOT", "SOMETHING_ELSE")).toBe("EN_RUTA");
  });
});

describe("outcomeToCardStatus", () => {
  it("maps every ItemOutcome value to the identically-named CardStatus", () => {
    expect(outcomeToCardStatus("EN_RUTA")).toBe("EN_RUTA");
    expect(outcomeToCardStatus("ACUSE_RECIBIDO")).toBe("ACUSE_RECIBIDO");
    expect(outcomeToCardStatus("DEVUELTA_TIENDA")).toBe("DEVUELTA_TIENDA");
  });
});

describe("shouldLogOutcomeTransition", () => {
  it("is false for EN_RUTA, unchanged status, no comentario (suppression case)", () => {
    expect(
      shouldLogOutcomeTransition({ outcome: "EN_RUTA", statusChanged: false, comentario: undefined }),
    ).toBe(false);
  });

  it("is true when the outcome is not EN_RUTA, even if status did not change", () => {
    expect(
      shouldLogOutcomeTransition({ outcome: "ACUSE_RECIBIDO", statusChanged: false, comentario: undefined }),
    ).toBe(true);
  });

  it("is true when status changed, even if outcome is EN_RUTA and no comentario", () => {
    expect(shouldLogOutcomeTransition({ outcome: "EN_RUTA", statusChanged: true, comentario: undefined })).toBe(
      true,
    );
  });

  it("is true when a comentario is present, even if outcome is EN_RUTA and status unchanged", () => {
    expect(
      shouldLogOutcomeTransition({ outcome: "EN_RUTA", statusChanged: false, comentario: "nota" }),
    ).toBe(true);
  });

  it("treats a whitespace-only comentario as PRESENT — pinned to the original handlers' raw `input.comentario` truthiness check (neither handler trims before this specific condition, unlike the separate returnReason resolution which does)", () => {
    expect(
      shouldLogOutcomeTransition({ outcome: "EN_RUTA", statusChanged: false, comentario: "   " }),
    ).toBe(true);
  });

  it("treats an empty-string comentario as absent (empty string is falsy even untrimmed)", () => {
    expect(shouldLogOutcomeTransition({ outcome: "EN_RUTA", statusChanged: false, comentario: "" })).toBe(
      false,
    );
  });
});

describe("buildOutcomeNote — ROUTE domain (pinned to applyItemResult's exact strings)", () => {
  it("appends the mensajero name and combines prefix+comentario with a colon for ACUSE_RECIBIDO", () => {
    const note = buildOutcomeNote({
      domain: "ROUTE",
      outcome: "ACUSE_RECIBIDO",
      comentario: "direccion incorrecta",
      routeId: "route-1",
      messengerName: "Pedro Gonzalez",
    });
    expect(note).toBe("Acuse recibido por mensajero Pedro Gonzalez: direccion incorrecta");
  });

  it("falls back to the routeId-suffixed default when there is no comentario", () => {
    const note = buildOutcomeNote({
      domain: "ROUTE",
      outcome: "ACUSE_RECIBIDO",
      routeId: "route-1",
      messengerName: "Pedro Gonzalez",
    });
    expect(note).toBe("Acuse recibido por mensajero Pedro Gonzalez (ruta route-1)");
  });

  it("uses the DEVUELTA_TIENDA prefix and omits the mensajero clause when no messenger name is given", () => {
    const note = buildOutcomeNote({
      domain: "ROUTE",
      outcome: "DEVUELTA_TIENDA",
      comentario: "direccion incorrecta",
      routeId: "route-1",
      messengerName: null,
    });
    expect(note).toBe("Tarjeta devuelta a tienda: direccion incorrecta");
  });

  it("uses the EN_RUTA generic prefix", () => {
    const note = buildOutcomeNote({ domain: "ROUTE", outcome: "EN_RUTA", routeId: "route-1" });
    expect(note).toBe("Actualizacion en ruta (ruta route-1)");
  });

  it("embeds a whitespace-only comentario verbatim, untrimmed — pinned to the original's raw `input.comentario` check (not the trimmed value)", () => {
    const note = buildOutcomeNote({
      domain: "ROUTE",
      outcome: "ACUSE_RECIBIDO",
      comentario: "   ",
      routeId: "route-1",
      messengerName: "Pedro Gonzalez",
    });
    expect(note).toBe("Acuse recibido por mensajero Pedro Gonzalez:    ");
  });
});

describe("buildOutcomeNote — LOT domain (pinned to applyLotItemResult's exact strings)", () => {
  it("uses the raw comentario verbatim, with no prefix, when a comentario is present", () => {
    const note = buildOutcomeNote({
      domain: "LOT",
      outcome: "DEVUELTA_TIENDA",
      comentario: "paquete rechazado",
      lotNumber: "LOTE-20260801-001",
    });
    expect(note).toBe("paquete rechazado");
  });

  it("falls back to the lote-number-suffixed default for ACUSE_RECIBIDO when there is no comentario", () => {
    const note = buildOutcomeNote({ domain: "LOT", outcome: "ACUSE_RECIBIDO", lotNumber: "LOTE-20260801-001" });
    expect(note).toBe("Acuse recibido por lote LOTE-20260801-001");
  });

  it("falls back to the EN_RUTA generic default for lot updates", () => {
    const note = buildOutcomeNote({ domain: "LOT", outcome: "EN_RUTA", lotNumber: "LOTE-20260801-001" });
    expect(note).toBe("Actualizada por lote LOTE-20260801-001");
  });

  it("uses a whitespace-only comentario verbatim, untrimmed — same raw-truthiness pinning as the ROUTE domain", () => {
    const note = buildOutcomeNote({ domain: "LOT", outcome: "ACUSE_RECIBIDO", comentario: "  ", lotNumber: "LOTE-1" });
    expect(note).toBe("  ");
  });
});

describe("resolveReturnReason", () => {
  it("prefers a trimmed comentario over the card's existing returnReason", () => {
    expect(resolveReturnReason({ comentario: "  motivo nuevo  ", cardReturnReason: "motivo viejo" })).toBe(
      "motivo nuevo",
    );
  });

  it("falls back to the card's trimmed returnReason when no comentario is given", () => {
    expect(resolveReturnReason({ comentario: undefined, cardReturnReason: "  motivo viejo  " })).toBe(
      "motivo viejo",
    );
  });

  it("returns null when neither a comentario nor a fallback reason exists", () => {
    expect(resolveReturnReason({ comentario: undefined, cardReturnReason: null })).toBeNull();
    expect(resolveReturnReason({ comentario: "   ", cardReturnReason: undefined })).toBeNull();
  });
});

describe("assertReturnReasonPresent", () => {
  it("throws RETURN_REASON_REQUIRED for DEVUELTA_TIENDA with no resolved reason", () => {
    expect(() => assertReturnReasonPresent("DEVUELTA_TIENDA", null)).toThrowError("RETURN_REASON_REQUIRED");
  });

  it("does not throw for DEVUELTA_TIENDA with a resolved reason", () => {
    expect(() => assertReturnReasonPresent("DEVUELTA_TIENDA", "motivo")).not.toThrow();
  });

  it("does not throw for ACUSE_RECIBIDO or EN_RUTA regardless of reason", () => {
    expect(() => assertReturnReasonPresent("ACUSE_RECIBIDO", null)).not.toThrow();
    expect(() => assertReturnReasonPresent("EN_RUTA", null)).not.toThrow();
  });
});

describe("isClosedCardStatus", () => {
  it("is true for RETORNADA and DEVUELTA_TIENDA", () => {
    expect(isClosedCardStatus("RETORNADA")).toBe(true);
    expect(isClosedCardStatus("DEVUELTA_TIENDA")).toBe(true);
  });

  it("is false for EN_RUTA, ACUSE_RECIBIDO, null, or undefined", () => {
    expect(isClosedCardStatus("EN_RUTA")).toBe(false);
    expect(isClosedCardStatus("ACUSE_RECIBIDO")).toBe(false);
    expect(isClosedCardStatus(null)).toBe(false);
    expect(isClosedCardStatus(undefined)).toBe(false);
  });
});
