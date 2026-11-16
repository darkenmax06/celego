import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeDebitRequestNumber } from "../../lib/importers/debit-request-number";
import { parseDebitConsolidadoImport } from "../../lib/importers/debit-consolidado";
import { parseDebitDespachoImport } from "../../lib/importers/debit-despacho";

function workbook(sheet: string, rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("normalizeDebitRequestNumber", () => {
  it("accepts a clean request number", () => {
    expect(normalizeDebitRequestNumber("4-14492637802")).toBe("4-14492637802");
    expect(normalizeDebitRequestNumber(" 4-14492637802 ")).toBe("4-14492637802");
  });

  it("strips spreadsheet residue around the number", () => {
    expect(normalizeDebitRequestNumber("4-14492637802+F40A2:A31")).toBe("4-14492637802");
  });

  it("rejects corrupt or malformed values", () => {
    expect(normalizeDebitRequestNumber("c")).toBeNull();
    expect(normalizeDebitRequestNumber("")).toBeNull();
    expect(normalizeDebitRequestNumber("4-1449263780")).toBeNull();
    expect(normalizeDebitRequestNumber("4-144926378021")).toBeNull();
    expect(normalizeDebitRequestNumber("14-14492637802")).toBeNull();
  });
});

describe("debit parsers validate the request number", () => {
  it("consolidado: keeps the clean number and reports corrupt rows", () => {
    const buffer = workbook("DATA", [
      ["Fecha", "N-SS", "NRO_ID", "CONTACTO", "PROVINCIA", "STATUS"],
      ["2026-11-04", "4-14492637802+F40A2:A31", "40218182950", "CAROLINE", "La Altagracia", "EN RUTA"],
      ["2026-11-04", "c", "40209205927", "JEFFERSON", "Santiago", "EN RUTA"],
    ]);
    const result = parseDebitConsolidadoImport(buffer);
    expect(result.rows.map((row) => row.requestNumber)).toEqual(["4-14492637802"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('"c"');
  });

  it("despacho: keeps the clean number and reports corrupt rows", () => {
    const buffer = workbook("CELE", [
      ["NRO_SS", "NRO_ID", "CONTACTO", "PROVINCIA", "Fecha"],
      ["4-14492637802+F40A2:A31", "40218182950", "CAROLINE", "La Altagracia", "2026-11-04"],
      ["c", "40209205927", "JEFFERSON", "Santiago", "2026-11-04"],
    ]);
    const result = parseDebitDespachoImport(buffer);
    expect(result.rows.map((row) => row.requestNumber)).toEqual(["4-14492637802"]);
    expect(result.errors).toHaveLength(1);
  });
});
