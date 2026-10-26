import { describe, expect, it } from "vitest";
import { buildCardFacets } from "@/lib/filters/card-facets";

function provinceOptions(sources: Parameters<typeof buildCardFacets>[1]) {
  return buildCardFacets(["provincia"], sources)[0].options;
}

describe("province facet with inactive provinces", () => {
  it("lists active provinces first and inactive ones last, labelled as inactive", () => {
    expect(
      provinceOptions({ provincias: ["Azua", "Santiago"], inactiveProvincias: ["Distrito Nacional"] }),
    ).toEqual([
      { label: "Azua", value: "Azua" },
      { label: "Santiago", value: "Santiago" },
      { label: "Distrito Nacional (inactiva)", value: "Distrito Nacional" },
    ]);
  });

  it("keeps the plain list when no inactive provinces are given", () => {
    expect(provinceOptions({ provincias: ["Azua"] })).toEqual([{ label: "Azua", value: "Azua" }]);
  });
});
