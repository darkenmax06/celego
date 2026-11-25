import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportRowsToXlsx, toExcelDate } from "../../lib/reports/export";

describe("Excel exports write real date cells", () => {
  it("recognizes the date formats Celego exports use", () => {
    expect(toExcelDate("03/11/2026")).toEqual({ value: new Date(Date.UTC(2026, 10, 3)), numFmt: "dd/mm/yyyy" });
    expect(toExcelDate("3/11/2026")?.value).toEqual(new Date(Date.UTC(2026, 10, 3)));
    expect(toExcelDate("2026-11-03")?.value).toEqual(new Date(Date.UTC(2026, 10, 3)));
    expect(toExcelDate("2026-11-03 14:05:00")).toEqual({ value: new Date(Date.UTC(2026, 10, 3, 14, 5)), numFmt: "dd/mm/yyyy hh:mm" });
    // UTC instants show in Dominican time; midnight-UTC calendar dates keep their day.
    expect(toExcelDate("2026-11-03T02:00:00.000Z")?.value).toEqual(new Date(Date.UTC(2026, 10, 2, 22, 0)));
    expect(toExcelDate(new Date("2026-11-03T00:00:00.000Z"))).toEqual({ value: new Date(Date.UTC(2026, 10, 3)), numFmt: "dd/mm/yyyy" });
  });

  it("leaves non-date values alone", () => {
    for (const value of ["4-14450572842", "00116754557", "8094484089", "31/02/2026", "-", "", 12, null]) {
      expect(toExcelDate(value)).toBeNull();
    }
  });

  it("exportRowsToXlsx stores date columns as dates", async () => {
    const buffer = await exportRowsToXlsx([
      { Solicitud: "4-14450572842", "Fecha despacho": "03/11/2026", Actualizado: new Date("2026-11-03T15:30:00Z") },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as ArrayBuffer);
    const row = wb.worksheets[0].getRow(2);
    expect(row.getCell(1).value).toBe("4-14450572842");
    expect(row.getCell(2).value).toEqual(new Date(Date.UTC(2026, 10, 3)));
    expect(row.getCell(2).numFmt).toBe("dd/mm/yyyy");
    expect(row.getCell(3).value).toEqual(new Date(Date.UTC(2026, 10, 3, 11, 30)));
  });
});
