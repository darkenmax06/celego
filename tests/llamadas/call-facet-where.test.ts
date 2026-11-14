import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { buildCallFacetWhere } from "@/lib/llamadas/call-facet-where";

function build(query: Record<string, string>) {
  return buildCallFacetWhere(new URLSearchParams(query));
}

describe("buildCallFacetWhere", () => {
  it("adds nothing when no facet is set", () => {
    expect(build({})).toEqual([]);
    expect(build({ provincia: "", zona: "ALL", messengerId: "ALL" })).toEqual([]);
  });

  it("compiles multi-select and single-value facets", () => {
    expect(
      build({
        provincia: "Santiago,La Vega",
        zona: "Norte",
        status: "EN_RUTA,NO_LOCALIZADO",
        productType: "DEBITO",
        messengerId: "m-1",
        urgent: "1",
      }),
    ).toEqual([
      { provincia: { in: ["Santiago", "La Vega"] } },
      { zona: { in: ["Norte"] } },
      { status: { in: ["EN_RUTA", "NO_LOCALIZADO"] } },
      { productType: "DEBITO" },
      { currentMessengerId: "m-1" },
      { urgent: true },
    ]);
  });

  it("drops invalid enum values", () => {
    expect(build({ status: "NOPE", productType: "OTRO", canalContacto: "SMS" })).toEqual([]);
  });

  it("maps contact facets onto metadata.operativo", () => {
    expect(build({ contactoEstado: "NO_CONTACTADA", canalContacto: "WHATSAPP" })).toEqual([
      { NOT: { metadata: { path: ["operativo", "contactado"], equals: true } } },
      { metadata: { path: ["operativo", "canalContacto"], equals: "WHATSAPP" } },
    ]);
    expect(build({ contactoEstado: "TRASLADO_SOLICITADO" })).toEqual([
      { metadata: { path: ["operativo", "traslado", "provinciaDestino"], not: Prisma.AnyNull } },
    ]);
  });

  it("supports the grupo facet", () => {
    expect(build({ grupo: "SIN_GRUPO" })).toHaveLength(1);
  });
});
