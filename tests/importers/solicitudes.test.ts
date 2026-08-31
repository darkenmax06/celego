import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSolicitudesImport } from "@/lib/importers/solicitudes";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 2, tasks 2.1/2.3.
 *
 * Mirrors `lib/importers/urgentes.ts` exactly (design "Import/export/UI
 * reuse existing templates verbatim"): `readWorkbook` -> `getSheetRows(wb,
 * "MBE")` -> `findHeaderRow` against the MBE-sheet REQUIRED aliases.
 */
function buildBuffer(headers: string[], rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MBE");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const HEADERS = [
  "NUMERO TC",
  "CEDULA",
  "NOMBRE",
  "TICKET",
  "ETAPA",
  "ANALISTA",
  "DESTINO",
  "PROVINCIA",
  "NUMERO",
  "DIRECCION",
  "LOG ACTUAL",
  "CANTIDAD DIAS",
  "FECHA A SUPLIDOR",
];

describe("parseSolicitudesImport", () => {
  it("parses a matched row from the MBE sheet into a ParsedSolicitudRow", () => {
    const buffer = buildBuffer(HEADERS, [
      [
        "4000000000000001",
        "001-0000001-1",
        "JUAN PEREZ",
        "T-1001",
        "EN PROCESO",
        "MARIA GOMEZ",
        "SANTO DOMINGO",
        "DISTRITO NACIONAL",
        "8091234567",
        "Calle 1",
        "PENDIENTE",
        "2",
        "45900",
      ],
    ]);

    const result = parseSolicitudesImport(buffer);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    expect(row.tc).toBe("4000000000000001");
    expect(row.cedula).toBe("001-0000001-1");
    expect(row.ticket).toBe("T-1001");
    expect(row.etapa).toBe("EN PROCESO");
    expect(row.analista).toBe("MARIA GOMEZ");
    expect(row.destino).toBe("SANTO DOMINGO");
    expect(row.sourceRow).toMatchObject({ "NUMERO TC": "4000000000000001" });
  });

  it("reports a row missing tc or cedula as an import error, without producing a parsed row (spec: unmatched row is reported)", () => {
    const buffer = buildBuffer(HEADERS, [
      ["", "001-0000002-2", "SIN TC", "T-1002", "", "", "", "", "", "", "", "", ""],
    ]);

    const result = parseSolicitudesImport(buffer);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/tc|cedula/i);
  });

  it("skips a fully blank row without producing an error or a parsed row", () => {
    const buffer = buildBuffer(HEADERS, [["", "", "", "", "", "", "", "", "", "", "", "", ""]]);

    const result = parseSolicitudesImport(buffer);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
