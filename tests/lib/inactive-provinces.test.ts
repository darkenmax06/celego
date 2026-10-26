import { describe, expect, it, vi } from "vitest";
import {
  countInactiveProvinceRows,
  formatInactiveProvinceWarning,
  loadInactiveProvinceNames,
} from "@/lib/inactive-provinces";

describe("countInactiveProvinceRows", () => {
  it("matches accent- and case-insensitively and reports the configured spelling", () => {
    const result = countInactiveProvinceRows(
      ["samana", "SAMANÁ", "Santiago", "Samaná"],
      ["Samaná"],
    );
    expect(result).toEqual({ count: 3, names: ["Samaná"] });
  });

  it("resolves the importers' province aliases before comparing", () => {
    const result = countInactiveProvinceRows(["DN", "Distrito", "distrito nacional", "Santo Domingo"], ["Distrito Nacional"]);
    expect(result).toEqual({ count: 3, names: ["Distrito Nacional"] });
  });

  it("lists every inactive province once, in first-seen order", () => {
    const result = countInactiveProvinceRows(["Moca", "DN", "Espaillat", "Santiago"], ["Distrito Nacional", "Espaillat"]);
    expect(result).toEqual({ count: 3, names: ["Espaillat", "Distrito Nacional"] });
  });

  it("ignores blank provinces and returns zero when nothing is inactive", () => {
    expect(countInactiveProvinceRows(["", null, undefined, "  "], ["Santiago"])).toEqual({ count: 0, names: [] });
    expect(countInactiveProvinceRows(["Santiago"], [])).toEqual({ count: 0, names: [] });
  });
});

describe("formatInactiveProvinceWarning", () => {
  it("uses plural and singular Spanish wording", () => {
    expect(formatInactiveProvinceWarning(3, ["Distrito Nacional"])).toBe("3 filas vinieron con provincia inactiva (Distrito Nacional).");
    expect(formatInactiveProvinceWarning(1, ["Samaná"])).toBe("1 fila vino con provincia inactiva (Samaná).");
    expect(formatInactiveProvinceWarning(2, ["Samaná", "Azua"])).toBe("2 filas vinieron con provincia inactiva (Samaná, Azua).");
  });

  it("returns null when there is nothing to warn about", () => {
    expect(formatInactiveProvinceWarning(0, [])).toBeNull();
    expect(formatInactiveProvinceWarning(undefined, undefined)).toBeNull();
  });
});

describe("loadInactiveProvinceNames", () => {
  it("reads only inactive ProvinceConfig names", async () => {
    const findMany = vi.fn(async () => [{ nombre: "Samaná" }]);
    await expect(loadInactiveProvinceNames({ provinceConfig: { findMany } })).resolves.toEqual(["Samaná"]);
    expect(findMany).toHaveBeenCalledWith({ where: { active: false }, select: { nombre: true } });
  });
});
