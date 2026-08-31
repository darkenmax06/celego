import { describe, expect, it } from "vitest";
import { resolveContractIdentifiers } from "@/lib/route-contract-selection";

/**
 * SDD `contrato-tarjetas-pistoleo` — targeted fix batch (verify-report id 614,
 * CRITICAL finding). `POST /api/rutas` already accepts `contractIdentifiers`
 * as a genuine per-card subset of `identifiers` (see app/api/rutas/route.ts),
 * but `rutas-client.tsx` used to send either every identifier in the batch or
 * none via a single all-or-nothing checkbox. `resolveContractIdentifiers`
 * is the pure function that replaces that logic: it intersects the set of
 * card ids the analyst explicitly marked "requiere contrato" with the actual
 * identifiers being submitted in this batch, so removed/never-submitted
 * cards can never leak into the payload.
 */
describe("resolveContractIdentifiers", () => {
  it("returns only the marked identifiers that are also in the submitted batch", () => {
    const result = resolveContractIdentifiers(
      ["card-1", "card-2", "card-3"],
      new Set(["card-1", "card-3"]),
    );
    expect(result).toEqual(["card-1", "card-3"]);
  });

  it("excludes a marked identifier that was removed from the batch before submit", () => {
    const result = resolveContractIdentifiers(["card-1"], new Set(["card-1", "card-2"]));
    expect(result).toEqual(["card-1"]);
  });

  it("returns an empty array when nothing is marked", () => {
    const result = resolveContractIdentifiers(["card-1", "card-2"], new Set());
    expect(result).toEqual([]);
  });

  it("returns an empty array when nothing is submitted", () => {
    const result = resolveContractIdentifiers([], new Set(["card-1"]));
    expect(result).toEqual([]);
  });

  it("preserves the submitted order, not the marked set's insertion order", () => {
    const result = resolveContractIdentifiers(
      ["card-3", "card-1", "card-2"],
      new Set(["card-1", "card-3"]),
    );
    expect(result).toEqual(["card-3", "card-1"]);
  });
});
