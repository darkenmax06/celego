import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { generateDebitPinitExcel } from "../../lib/generators/debit-pinit-export";
import { generateUpdatedConsolidadoExcel } from "../../lib/generators/debit-consolidado-export";
import * as XLSX from "xlsx";

describe("debit export generators", () => {
  it("generates 46-column Pinit template Excel file", () => {
    const cards = [
      {
        requestNumber: "4-14066270092",
        nombre: "DAYRA LUISA SANTA SANTOS MATEO",
        cedula: "40200000000",
        provincia: "Santo Domingo",
        zona: "Metro",
        direccionRaw: "Herrera Palmarito No. 11",
        telefonosRaw: "8099800483 | 8294562652",
        metadata: {
          sector: "DISTRITO NACIONAL",
          calle: "Herrera Palmarito",
          numero: "11",
          referencia: "Iglesia la profecia",
        },
      },
    ];

    const buffer = generateDebitPinitExcel(cards, new Date("2026-08-21T12:00:00Z"));
    expect(buffer).toBeDefined();

    const wb = XLSX.read(buffer, { type: "buffer" });
    expect(wb.SheetNames).toContain("Sheet1");

    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"], { header: 1 }) as (string | number)[][];
    expect(rows[0]).toHaveLength(46);
    expect(rows[0][0]).toBe("Cliente Primario[*]");
    expect(rows[0][22]).toBe("No. de orden[*]");

    expect(rows[1][0]).toBe("BPD DEBITO- Celeritas");
    expect(rows[1][22]).toBe("4-14066270092");
    expect(rows[1][10]).toBe("11111"); // Metro postal code
    expect(rows[1][18]).toBe("Ciudad"); // Metro estado
  });

  it("replaces DATA instead of retaining rows from the template", { timeout: 20000 }, async () => {
    const cards = [
      {
        id: "c1",
        requestNumber: "4-13794643002",
        tc: "4-13794643002",
        cedula: "05600054539",
        nombre: "NURYS JULISSA ABREU TAVAREZ",
        provincia: "Santiago",
        zona: "Norte",
        direccionRaw: "Arroyo Hondo No. 17",
        telefonosRaw: "8092515808",
        status: "TD_ENTREGADO",
        dispatchDate: new Date("2026-08-01"),
        deliveryDate: new Date("2026-08-05"),
        isRemote: false,
        comment: "Entregado a cliente",
        recipientName: "PRINCIPAL",
        createdAt: new Date("2026-08-01"),
      },
      {
        id: "c2",
        requestNumber: "4-13800808542",
        tc: "4-13800808542",
        cedula: "40224078192",
        nombre: "CRISMARY JIMENEZ GUZMAN",
        provincia: "Puerto Plata",
        zona: "Norte",
        direccionRaw: "Calle 1",
        telefonosRaw: "8295521220",
        status: "EN_RUTA",
        dispatchDate: new Date("2026-08-01"),
        isRemote: false,
        createdAt: new Date("2026-08-01"),
      },
    ];

    const buffer = await generateUpdatedConsolidadoExcel(cards);
    expect(buffer).toBeDefined();

    const wb = XLSX.read(buffer, { type: "buffer" });
    expect(wb.SheetNames).toContain("DATA");
    expect(wb.SheetNames).toContain("Sheet1");

    const dataRows = XLSX.utils.sheet_to_json(wb.Sheets["DATA"], { header: 1 }) as (string | number)[][];
    expect(dataRows[0][1]).toBe("N-SS");
    expect(dataRows[0][33]).toBe("STATUS");
    expect(dataRows[1][33]).toBe("TD- ENTREGADO");
    expect(dataRows[2][33]).toBe("EN RUTA");
    expect(dataRows).toHaveLength(3);

    const templatePath = path.join(process.cwd(), "storage", "templates", "consolidado-debito-base.xlsx");
    const template = await JSZip.loadAsync(fs.readFileSync(templatePath));
    const output = await JSZip.loadAsync(buffer);

    for (const name of ["xl/charts/chart1.xml", "xl/pivotTables/pivotTable1.xml", "xl/drawings/drawing2.xml", "xl/styles.xml"]) {
      expect(await output.file(name)?.async("string")).toBe(await template.file(name)?.async("string"));
    }
  });

  it("exports additional cards with identical request numbers as distinct rows", { timeout: 20000 }, async () => {
    const cards = [
      {
        id: "c-orig",
        requestNumber: "4-99999999991",
        tc: "4-99999999991",
        cedula: "40200000001",
        nombre: "TITULAR ORIGINAL",
        provincia: "Santo Domingo",
        zona: "Metro",
        direccionRaw: "Calle Principal 1",
        telefonosRaw: "8091112233",
        status: "DESPACHADA",
        dispatchDate: new Date("2026-08-30"),
        isRemote: false,
        createdAt: new Date("2026-08-30"),
      },
      {
        id: "c-adic",
        requestNumber: "4-99999999991",
        tc: "4-99999999991",
        cedula: "40200000002",
        nombre: "ADICIONAL MISMO SS",
        provincia: "Santo Domingo",
        zona: "Metro",
        direccionRaw: "Calle Principal 1",
        telefonosRaw: "8091112233",
        status: "DESPACHADA",
        dispatchDate: new Date("2026-08-30"),
        isRemote: false,
        createdAt: new Date("2026-08-30"),
      },
    ];

    const buffer = await generateUpdatedConsolidadoExcel(cards);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const dataRows = XLSX.utils.sheet_to_json(wb.Sheets["DATA"], { header: 1 }) as (string | number)[][];

    const matchingRows = dataRows.filter((r) => r[1] === "4-99999999991");
    expect(matchingRows.length).toBe(2);
    expect(matchingRows[0][7]).toBe("TITULAR ORIGINAL");
    expect(matchingRows[1][7]).toBe("ADICIONAL MISMO SS");
  });
});
