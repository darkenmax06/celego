import { describe, expect, it } from "vitest";
import { resolveNormalizedImportLocation } from "../../lib/card-service";
import { parseNormalizedCardRows } from "../../lib/importers/card-normalize";

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

describe("parseNormalizedCardRows address handling", () => {
  const header = [
    "TIPO DE ENTREGA", "FECHA", "TC SANEADA", "NOMBRE", "ZONA", "CEDULA", "Calle y No",
  ];
  const row = (tc: string, cedula: string, calle: string) => [
    "AUTOMATICAS ZONA ESTE", "9/04/2026", tc, "JOAN PUELLO", "SAN PEDRO DE MACORIS", cedula, calle,
  ];

  it("imports a card whose address block is empty instead of rejecting it", () => {
    // Torre ships cards with no address at all; those rows used to fail with
    // "direccion requerida" and vanish from the batch.
    const parsed = parseNormalizedCardRows([header, row("5415019046976144", "02301599078", "")]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].direccionRaw).toBeNull();
  });

  it("still keeps an address when the file provides one", () => {
    const parsed = parseNormalizedCardRows([header, row("5415019043875092", "02301692394", "AV INDEPENDENCIA")]);
    expect(parsed.rows[0].direccionRaw).toBe("AV INDEPENDENCIA");
  });

  it("still rejects rows missing an identifier, not just an address", () => {
    const parsed = parseNormalizedCardRows([header, row("", "02301599078", "")]);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0].message).toContain("TC invalido");
  });
});
