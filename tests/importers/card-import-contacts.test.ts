import { describe, expect, it } from "vitest";
import { parseNormalizedCardRows } from "../../lib/importers/card-normalize";
import { mergePhoneLists, planCustomerMerge } from "../../lib/customer-merge";

const torreHeader = [
  "TIPO DE ENTREGA", "FECHA", "GESTION", "TC SANEADA", "NOMBRE", "ZONA", "CANTIDAD", "CEDULA",
  "Calle y No", "DIRECCION 1", "DIRECCION 2", "DIRECCION 3", "REFERENCIA 1", "REFERENCIA 2",
  "TEL 1", "TEL 2", "TEL 3", "TEL 4", "TEL 5",
];

function torreRow(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    "TIPO DE ENTREGA": "AUTOMATICAS ZONA ESTE", FECHA: "2026-10-09", GESTION: "EOD", "TC SANEADA": "4921019379467350",
    NOMBRE: "MARIA GIRON", ZONA: "SAN PEDRO DE MACORIS", CANTIDAD: "001", CEDULA: "02300844152",
    "Calle y No": "C FACUNDO MADRIGAL 47", "DIRECCION 1": "NA", "DIRECCION 2": "PUNTA PESCADORA", "DIRECCION 3": "punta pescadora",
    "REFERENCIA 1": "PROX AL COLEGIO", "REFERENCIA 2": "8496204860 8AMA 5PM",
    "TEL 1": "8092287374", "TEL 2": "9999999999", "TEL 3": "8495551111 / 8295552222", "TEL 4": "8092287374", "TEL 5": "",
    ...overrides,
  };
  return torreHeader.map((name) => base[name]);
}

describe("card import contact data", () => {
  it("keeps every address and reference column, dropping placeholders and repeats", () => {
    const parsed = parseNormalizedCardRows([torreHeader, torreRow()]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].direccionRaw).toBe(
      "C FACUNDO MADRIGAL 47 | PUNTA PESCADORA | PROX AL COLEGIO | 8496204860 8AMA 5PM",
    );
  });

  it("keeps every phone column, splits cells holding several numbers and drops placeholders and repeats", () => {
    const parsed = parseNormalizedCardRows([torreHeader, torreRow()]);
    expect(parsed.rows[0].telefonosRaw).toBe("8092287374 | 8495551111 | 8295552222");
  });

  it("explains each invalid field with the offending value", () => {
    const parsed = parseNormalizedCardRows([
      torreHeader,
      torreRow({ "TC SANEADA": "12345", CEDULA: "", FECHA: "no-fecha" }),
    ]);
    expect(parsed.rows).toEqual([]);
    const message = parsed.errors[0].message;
    expect(message).toContain('TC invalido: "12345"');
    expect(message).toContain("cedula invalida: vacio");
    expect(message).toContain('fecha invalida: "no-fecha"');
    expect(message).toContain("MARIA GIRON");
  });

  it("names the first row of a duplicated source record", () => {
    const parsed = parseNormalizedCardRows([torreHeader, torreRow(), torreRow()]);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].message).toContain("ya aparecen en la fila 2");
  });

  it("reports ignored totals rows instead of dropping them silently", () => {
    const parsed = parseNormalizedCardRows([torreHeader, torreRow(), torreRow({ NOMBRE: "TOTAL", "TC SANEADA": "", CEDULA: "" })]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.ignored).toEqual([expect.objectContaining({ row: 3 })]);
  });
});

describe("customer merge on import", () => {
  const existing = {
    nombre: "Maria Giron",
    telefonosRaw: "809-228-7374",
    direccionRaw: "Calle A 1",
    provincia: null,
    zona: "Este",
  };

  it("never replaces stored values, only fills empty ones and reports what it kept", () => {
    const plan = planCustomerMerge(existing, {
      nombre: "MARIA GIRON PENA",
      direccionRaw: "Otra calle",
      provincia: "San Pedro de Macoris",
      zona: "Este",
    });
    expect(plan.data).toEqual({ provincia: "San Pedro de Macoris" });
    expect(plan.preserved).toEqual(["nombre", "direccion"]);
  });

  it("adds new phone numbers while keeping the stored text and format", () => {
    expect(mergePhoneLists("809-228-7374", "8092287374 | 8495551111")).toBe("809-228-7374 | 8495551111");
    const plan = planCustomerMerge(existing, { nombre: "Maria Giron", telefonosRaw: "8495551111" });
    expect(plan.data.telefonosRaw).toBe("809-228-7374 | 8495551111");
  });

  it("is a no-op when the import brings nothing new", () => {
    expect(planCustomerMerge(existing, { nombre: "MARIA  GIRON", telefonosRaw: "8092287374", zona: "Este" })).toEqual({ data: {}, preserved: [] });
  });
});
