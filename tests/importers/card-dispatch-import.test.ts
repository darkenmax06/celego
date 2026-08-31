import { describe, expect, it } from "vitest";
import { parseNormalizedCardRows } from "../../lib/importers/card-normalize";

describe("dual card import parsing", () => {
  it("detects Centro de Acopio strictly, maps fecha de carga to dispatch date, preserves identifiers, and nulls optional fields", () => {
    const rows = [
      ["TC", "TCC", "TERMINAL", "NOMBRE DEL CLIENTE", "CEDULA", "SECTOR", "NUMEROS DE CONTACTO", "NUMEROS ADC", "CANTIDAD", "FECHA DE CARGA"],
      ["5188123412349747", "", "047584", "Ana Perez", "00123456789", "Calle 1", "8095551234", "", 1, 46255],
    ];
    const parsed = parseNormalizedCardRows(rows);
    expect(parsed.origin).toBe("CENTRO_ACOPIO");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ tc: "5188123412349747", cedula: "00123456789", sourceTerminal: "047584", dispatchDate: new Date("2026-08-21T00:00:00.000Z"), provincia: "Santo Domingo", zona: "Metro", supplier: null, contractType: null });
  });

  it("rejects ambiguous headers, subtotal/footer rows, and malformed mandatory values without fabricating fields", () => {
    expect(() => parseNormalizedCardRows([["TC", "CEDULA", "NOMBRE"]])).toThrow("Formato de importacion desconocido o ambiguo");
    const rows = [
      ["TC", "TCC", "TERMINAL", "NOMBRE DEL CLIENTE", "CEDULA", "SECTOR", "NUMEROS DE CONTACTO", "NUMEROS ADC", "CANTIDAD", "FECHA DE CARGA"],
      ["", "", "", "SUBTOTAL", "", "", "", "", 7, ""],
      ["0000000000000000", "", "", "", "00000000000", "", "", "", 0, ""],
    ];
    const parsed = parseNormalizedCardRows(rows);
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].message).toContain("TC");
  });

  it("detects the historical Torre Popular signature and quarantines duplicate source identities", () => {
    const rows = [
      ["TIPO DE ENTREGA", "FECHA", "NO. TC", "CEDULA", "NOMBRES", "DIRECCION", "PROVINCIA"],
      ["NORMAL", "2026-08-21", "4111 1111 1111 1111", "402-3138262-9", "Ana Perez", "Calle 1", "Santo Domingo"],
      ["NORMAL", "2026-08-21", "4111111111111111", "40231382629", "Ana Perez", "Calle 1", "Santo Domingo"],
    ];

    const parsed = parseNormalizedCardRows(rows);

    expect(parsed.origin).toBe("TORRE_POPULAR");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toContainEqual(expect.objectContaining({ code: "DUPLICATE_SOURCE_RECORD" }));
  });
});
