import { describe, expect, it } from "vitest";
import {
  ALL_CARD_STATUS_VALUES,
  buildCardFacets,
  cardStatusValuesForProduct,
  pruneStatusesForProduct,
} from "../../lib/filters/card-facets";
import { filterAssignCards } from "../../lib/llamadas/assign-filters";

describe("status options by product", () => {
  it("lists every status when no product is selected", () => {
    expect(cardStatusValuesForProduct(undefined)).toEqual(ALL_CARD_STATUS_VALUES);
  });

  it("shows debit statuses plus the shared logistics ones for DEBITO", () => {
    const values = cardStatusValuesForProduct("DEBITO");
    expect(values).toContain("TD_ENTREGADO");
    expect(values).toContain("EN_RUTA");
    expect(values).not.toContain("ENTREGADA");
    expect(values).not.toContain("ACUSE_RECIBIDO");
  });

  it("hides TD statuses for CREDITO", () => {
    const values = cardStatusValuesForProduct("CREDITO");
    expect(values.some((value) => value.startsWith("TD_"))).toBe(false);
    expect(values).toContain("ENTREGADA");
  });

  it("narrows the Estado facet to the selected product", () => {
    const [status] = buildCardFacets(["status"], { productType: "DEBITO" });
    expect(status.options?.map((option) => option.value)).toEqual(cardStatusValuesForProduct("DEBITO"));
  });

  it("drops selected statuses the new product can never be in", () => {
    expect(pruneStatusesForProduct({ productType: "DEBITO", status: "ENTREGADA,EN_RUTA" })).toEqual({
      productType: "DEBITO",
      status: "EN_RUTA",
    });
    expect(pruneStatusesForProduct({ productType: "CREDITO", status: "TD_ENTREGADO" })).toEqual({ productType: "CREDITO" });
  });
});

describe("asignar list filters", () => {
  const cards = [
    { tc: "4-14060892362", status: "DESPACHADA", productType: "DEBITO", provincia: "LA ALTAGRACIA", zona: "Este", customer: { nombre: "Samuel", cedula: "40209551718" }, asignadoA: { id: "op1", name: "Operador Demo" } },
    { tc: "5188019044089702", status: "EN_RUTA", productType: "CREDITO", provincia: "PUNTA CANA", zona: "Este", customer: { nombre: "Rudelania", cedula: "08500118412" }, asignadoA: null },
  ];

  it("filters by search, product, status and assignment", () => {
    expect(filterAssignCards(cards, { q: "rudel" }).map((card) => card.tc)).toEqual(["5188019044089702"]);
    expect(filterAssignCards(cards, { productType: "DEBITO" })).toHaveLength(1);
    expect(filterAssignCards(cards, { status: "EN_RUTA,DESPACHADA" })).toHaveLength(2);
    expect(filterAssignCards(cards, { asignado: "SIN_ASIGNAR" }).map((card) => card.tc)).toEqual(["5188019044089702"]);
    expect(filterAssignCards(cards, { asignado: "op1" }).map((card) => card.tc)).toEqual(["4-14060892362"]);
  });
});
