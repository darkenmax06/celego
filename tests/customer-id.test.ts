import { describe, expect, it } from "vitest";
import { normalizeCustomerId } from "../lib/customer-id";
import { buildSourceRecordKey } from "../lib/dispatch-origin";
import { parseNormalizedCardRows } from "../lib/importers/card-normalize";

describe("customer identifier normalization", () => {
  it("keeps cedulas as digits only", () => {
    expect(normalizeCustomerId("402-3138262-9")).toBe("40231382629");
    expect(normalizeCustomerId("00123456789")).toBe("00123456789");
  });

  it("accepts alphanumeric passports without dropping their letters", () => {
    expect(normalizeCustomerId("C88C5VWLJ")).toBe("C88C5VWLJ");
    expect(normalizeCustomerId(" rd-1234567 ")).toBe("RD1234567");
  });

  it("rejects short, all-zero, letter-only and oversized values", () => {
    for (const value of ["885", "00000000000", "NOTIENE", "AB12", "A1234567890123456789X", ""]) {
      expect(normalizeCustomerId(value)).toBeNull();
    }
  });

  it("keeps distinct passports with the same digits in distinct source keys", () => {
    const base = { origin: "TORRE_POPULAR" as const, tc: "4111111111111111", dispatchDate: new Date("2026-10-23T00:00:00.000Z") };
    expect(buildSourceRecordKey({ ...base, cedula: "C88C5VWLJ" })).not.toBe(buildSourceRecordKey({ ...base, cedula: "X88X5ABCD" }));
  });

  it("imports a row whose CEDULA column holds a passport", () => {
    const parsed = parseNormalizedCardRows([
      ["TC", "TCC", "TERMINAL", "NOMBRE DEL CLIENTE", "CEDULA", "SECTOR", "NUMEROS DE CONTACTO", "NUMEROS ADC", "CANTIDAD", "FECHA DE CARGA"],
      ["5188123412349747", "", "047584", "Ana Perez", "C88C5VWLJ", "C LA MARINA NO 72", "8095551234", "", 1, 46255],
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ cedula: "C88C5VWLJ" });
  });
});
