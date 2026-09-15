import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseNormalizedCardRows } from "@/lib/importers/card-normalize";
import { getSheetRows, readWorkbook } from "@/lib/importers/workbook";
import { parseExcelSerialDate } from "@/lib/date";

function workbookWithDateCell(serial: number, format = "m/d/yy") {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["TIPO DE ENTREGA", "FECHA", "TC SANEADA", "NOMBRE", "ZONA", "CEDULA"],
    ["AUTOMATICAS ZONA ESTE", serial, "4921019110973036", "FIOR MONTAS PION", "HIGUEY", "29500014492"],
  ]);
  sheet.B2.z = format;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "ZONA ESTE");
  return readWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

// 2026-09-14 and 2026-09-03 as Excel serials
const SEPT_14 = 46279;
const SEPT_03 = 46268;

describe("getSheetRows date cells", () => {
  it("emits real date cells as ISO dates instead of the locale format", () => {
    expect(getSheetRows(workbookWithDateCell(SEPT_14))[1][1]).toBe("2026-09-14");
  });

  it("keeps day and month in place for the credit importer", () => {
    const parsed = parseNormalizedCardRows(getSheetRows(workbookWithDateCell(SEPT_03)));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].dispatchDate.toISOString().slice(0, 10)).toBe("2026-09-03");
  });

  it("does not reject dates whose day is above 12", () => {
    const parsed = parseNormalizedCardRows(getSheetRows(workbookWithDateCell(SEPT_14)));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].dispatchDate.toISOString().slice(0, 10)).toBe("2026-09-14");
  });

  it("stays readable by the debit date parser", () => {
    const value = getSheetRows(workbookWithDateCell(SEPT_03, "dd/mm/yyyy"))[1][1];
    const date = parseExcelSerialDate(value);
    expect([date?.getFullYear(), date?.getMonth(), date?.getDate()]).toEqual([2026, 8, 3]);
  });

  it("leaves plain numeric cells untouched", () => {
    expect(getSheetRows(workbookWithDateCell(1234, "0"))[1][1]).toBe("1234");
  });
});
