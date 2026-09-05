import { describe, expect, it } from "vitest";
import { resolveNormalizedImportLocation } from "../../lib/card-service";

function torre(provincia: string | null, zona: string | null) {
  return resolveNormalizedImportLocation({ origin: "TORRE_POPULAR", provincia, zona });
}

describe("resolveNormalizedImportLocation", () => {
  it("reads a ZONA column that carries the province name", () => {
    // Torre dispatch sheets ship a single ZONA column holding the province and
    // no PROVINCIA column, which used to reject the whole file as
    // UNRESOLVED_ZONE.
    expect(torre(null, "SAN PEDRO DE MACORIS")).toEqual({ province: "SAN PEDRO DE MACORIS", zone: "Este" });
    expect(torre(null, "HIGUEY")).toEqual({ province: "HIGUEY", zone: "Este" });
    expect(torre(null, "PUNTA CANA")).toEqual({ province: "PUNTA CANA", zone: "Este" });
  });

  it("keeps a canonical zone value as the zone", () => {
    expect(torre(null, "Este")).toEqual({ province: "Este", zone: "Este" });
    expect(torre("La Altagracia", "Norte")).toEqual({ province: "La Altagracia", zone: "Norte" });
  });

  it("prefers an explicit province column over the zona column", () => {
    expect(torre("Santiago", "SAN PEDRO DE MACORIS")).toEqual({ province: "Santiago", zone: "Norte" });
  });

  it("still reports an unresolvable row instead of guessing a zone", () => {
    expect(torre(null, "PROVINCIA INEXISTENTE").zone).toBe("");
    expect(torre(null, null).zone).toBe("");
  });

  it("pins centro de acopio rows to Santo Domingo / Metro", () => {
    expect(resolveNormalizedImportLocation({ origin: "CENTRO_ACOPIO", provincia: null, zona: null }))
      .toEqual({ province: "Santo Domingo", zone: "Metro" });
  });
});
