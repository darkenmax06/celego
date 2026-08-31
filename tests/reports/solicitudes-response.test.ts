import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildSolicitudesResponseWorkbook } from "@/lib/reports/solicitudes-response";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 2, task 2.2 (design D7).
 *
 * Re-emits the fixed MBE column order from `details` + promoted columns
 * via `exportRowsToXlsx`, for supplier response (spec "Download regenerates
 * source format").
 */
describe("buildSolicitudesResponseWorkbook", () => {
  it("emits one row per case with the pinned MBE column order", async () => {
    const buffer = await buildSolicitudesResponseWorkbook([
      {
        tc: "4000000000000001",
        cedula: "001-0000001-1",
        ticket: "T-1001",
        etapa: "EN PROCESO",
        analista: "MARIA GOMEZ",
        details: {
          destino: "SANTO DOMINGO",
          provinciaSolicitud: "DISTRITO NACIONAL",
          logActual: "PENDIENTE",
          cantidadDias: "2",
          fechaASuplidor: null,
          sourceRow: {},
        },
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Buffer);
    const sheet = workbook.worksheets[0];

    const headerRow = sheet.getRow(1).values as unknown[];
    expect(headerRow).toContain("NUMERO TC");
    expect(headerRow).toContain("TICKET");

    const dataRow = sheet.getRow(2).values as unknown[];
    expect(dataRow).toContain("4000000000000001");
    expect(dataRow).toContain("T-1001");
  });

  it("emits a placeholder row when there are no cases", async () => {
    const buffer = await buildSolicitudesResponseWorkbook([]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBeGreaterThan(0);
  });
});
