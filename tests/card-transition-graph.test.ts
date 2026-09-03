import { describe, expect, it } from "vitest";
import { evaluateEdge, listAllowedEdges } from "@/lib/card-transition-graph";

/**
 * SDD change `rutas-lotes-redesign` — Slice 4a, pulled forward from Phase 6
 * (task 5.2), because `lib/item-outcome-service.ts` (task 4.2) is this
 * change's FIRST live `CardTransitionPolicy` call site and needs a graph to
 * evaluate against in SHADOW mode from the moment it exists.
 *
 * Task 5.1 (`scripts/derive-card-transitions.ts` against production
 * `CardStatusLog` data) is BLOCKED — same hard safety constraint as task 1.0:
 * no live/production database access is permitted for this executor. The
 * allowlist below is therefore seeded defensively-minimal, same posture as
 * `LotStatus` (Slice 3): only edges DIRECTLY confirmed by Slice 1's golden
 * characterization suite (a `fromStatus` that a PASSING, non-throwing write
 * actually exercised) or by the unconditional, fromStatus-independent
 * mapping logic in `normalizeRouteResult`/`normalizeLotResult` (route/lot
 * creation always assigns a fixed CardStatus regardless of the card's prior
 * status). Everything else is UNLISTED, which SHADOW mode logs but never
 * blocks — that is the whole point of the ~2 week observation window.
 */
describe("evaluateEdge", () => {
  it("allows EN_RUTA -> ACUSE_RECIBIDO and EN_RUTA -> DEVUELTA_TIENDA (the two live outcomes Slice 1 exercised)", () => {
    expect(evaluateEdge("EN_RUTA", "ACUSE_RECIBIDO")).toMatchObject({ allowed: true, reason: "ALLOWED" });
    expect(evaluateEdge("EN_RUTA", "DEVUELTA_TIENDA")).toMatchObject({ allowed: true, reason: "ALLOWED" });
  });

  it("allows the EN_RUTA -> EN_RUTA no-op re-scan Slice 1 exercised", () => {
    expect(evaluateEdge("EN_RUTA", "EN_RUTA")).toMatchObject({ allowed: true, reason: "ALLOWED" });
  });

  it("allows genesis edges (null fromStatus) for route creation (-> EN_RUTA) and lot creation (-> ENVIADA_INTERIOR)", () => {
    expect(evaluateEdge(null, "EN_RUTA")).toMatchObject({ allowed: true, reason: "ALLOWED" });
    expect(evaluateEdge(null, "ENVIADA_INTERIOR")).toMatchObject({ allowed: true, reason: "ALLOWED" });
  });

  it("flags an unconfirmed edge as UNLISTED without asserting anything about whether it should be blocked", () => {
    const result = evaluateEdge("ACUSE_RECIBIDO", "DEVUELTA_TIENDA");
    expect(result).toMatchObject({ allowed: false, reason: "UNLISTED_EDGE" });
  });

  it("flags a closed-status fromStatus (RETORNADA) as UNLISTED — no passing Slice-1 case ever reached a write from it", () => {
    expect(evaluateEdge("RETORNADA", "EN_RUTA")).toMatchObject({ allowed: false, reason: "UNLISTED_EDGE" });
  });

  it("echoes the evaluated edge back on the result", () => {
    const result = evaluateEdge("EN_RUTA", "ACUSE_RECIBIDO");
    expect(result.edge).toEqual({ from: "EN_RUTA", to: "ACUSE_RECIBIDO" });
  });
});

describe("listAllowedEdges", () => {
  it("exposes exactly the 13 defensively-minimal edges documented above (8 pre-existing + 5 new advisory), no more", () => {
    const edges = listAllowedEdges();
    expect(edges).toHaveLength(13);
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: "EN_RUTA", to: "EN_RUTA" },
        { from: "EN_RUTA", to: "ACUSE_RECIBIDO" },
        { from: "EN_RUTA", to: "DEVUELTA_TIENDA" },
        { from: null, to: "EN_RUTA" },
        { from: null, to: "ENVIADA_INTERIOR" },
        { from: "EN_RUTA", to: "ENTREGA_SIN_CONTRATO" },
        { from: "ENTREGA_SIN_CONTRATO", to: "ACUSE_RECIBIDO" },
        { from: "ENTREGA_DIGITAL_SIN_CONTRATO", to: "ENTREGA_DIGITAL" },
        { from: "EN_RUTA", to: "EN_PROCESO_DE_RETORNO" },
        { from: "ENTREGA_DIGITAL", to: "EN_PROCESO_DE_RETORNO" },
        { from: "EN_PROCESO_DE_RETORNO", to: "RETORNADA" },
        { from: "EN_PROCESO_DE_RETORNO", to: "DEVUELTA_TIENDA" },
        { from: "EN_PROCESO_DE_RETORNO", to: "EN_RUTA" },
      ]),
    );
  });
});

/**
 * SDD solicitudes-reclamaciones-urgentes (design D5): 5 advisory SHADOW-only
 * edges for `EN_PROCESO_DE_RETORNO`. `evaluateEdge` never blocks regardless
 * of mode — asserting `allowed: true` only proves they are documented.
 */
describe("evaluateEdge — EN_PROCESO_DE_RETORNO advisory edges", () => {
  it("allows EN_RUTA -> EN_PROCESO_DE_RETORNO and ENTREGA_DIGITAL -> EN_PROCESO_DE_RETORNO", () => {
    expect(evaluateEdge("EN_RUTA", "EN_PROCESO_DE_RETORNO")).toMatchObject({ allowed: true, reason: "ALLOWED" });
    expect(evaluateEdge("ENTREGA_DIGITAL", "EN_PROCESO_DE_RETORNO")).toMatchObject({
      allowed: true,
      reason: "ALLOWED",
    });
  });

  it("allows EN_PROCESO_DE_RETORNO -> RETORNADA, DEVUELTA_TIENDA, and EN_RUTA", () => {
    expect(evaluateEdge("EN_PROCESO_DE_RETORNO", "RETORNADA")).toMatchObject({ allowed: true, reason: "ALLOWED" });
    expect(evaluateEdge("EN_PROCESO_DE_RETORNO", "DEVUELTA_TIENDA")).toMatchObject({
      allowed: true,
      reason: "ALLOWED",
    });
    expect(evaluateEdge("EN_PROCESO_DE_RETORNO", "EN_RUTA")).toMatchObject({ allowed: true, reason: "ALLOWED" });
  });
});

/**
 * SDD contrato-tarjetas-pistoleo (design D7): advisory edges for the two
 * new contract-exception statuses. SHADOW-only — asserting `allowed: true`
 * only proves they are documented, never that they are enforced.
 */
describe("evaluateEdge — contract exception advisory edges", () => {
  it("allows EN_RUTA -> ENTREGA_SIN_CONTRATO", () => {
    expect(evaluateEdge("EN_RUTA", "ENTREGA_SIN_CONTRATO")).toMatchObject({
      allowed: true,
      reason: "ALLOWED",
    });
  });

  it("allows ENTREGA_SIN_CONTRATO -> ACUSE_RECIBIDO", () => {
    expect(evaluateEdge("ENTREGA_SIN_CONTRATO", "ACUSE_RECIBIDO")).toMatchObject({
      allowed: true,
      reason: "ALLOWED",
    });
  });

  it("allows ENTREGA_DIGITAL_SIN_CONTRATO -> ENTREGA_DIGITAL", () => {
    expect(evaluateEdge("ENTREGA_DIGITAL_SIN_CONTRATO", "ENTREGA_DIGITAL")).toMatchObject({
      allowed: true,
      reason: "ALLOWED",
    });
  });
});
