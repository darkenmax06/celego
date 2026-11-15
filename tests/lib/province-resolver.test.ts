import { describe, expect, it } from "vitest";
import {
  buildProvinceResolver,
  findProvinceConflicts,
  mergeAliases,
  planDuplicateProvinceMerges,
  planStaticAliasSeeds,
  resolveProvinceAndZone,
  sanitizeAliases,
} from "@/lib/province-resolver";
import { planProvinceNormalization } from "@/lib/province-normalize-plan";

const configs = [
  { id: "dn", nombre: "Distrito Nacional", zona: "Metro", active: true, aliases: [] },
  { id: "hig", nombre: "Higuey", zona: "Este", active: true, aliases: ["Higüey (MG)"] },
  { id: "spm", nombre: "San Pedro de Macoris", zona: "Este", active: true, aliases: [] },
  { id: "sp", nombre: "San Pedro", zona: "Sur", active: false, aliases: [] },
];

describe("buildProvinceResolver", () => {
  const resolver = buildProvinceResolver(configs);

  it("matches the configured name ignoring case and accents", () => {
    expect(resolver.resolve("DISTRITO NACIONAL")).toEqual({ nombre: "Distrito Nacional", zona: "Metro", active: true });
    expect(resolver.resolve("  higüey ")).toEqual({ nombre: "Higuey", zona: "Este", active: true });
  });

  it("matches configured variants", () => {
    expect(resolver.resolve("HIGUEY (MG)")?.nombre).toBe("Higuey");
  });

  it("still matches inactive provinces and reports them as inactive", () => {
    expect(resolver.resolve("SAN PEDRO")).toEqual({ nombre: "San Pedro", zona: "Sur", active: false });
  });

  it("falls back to the static spelling table when it points at a configured province", () => {
    expect(resolver.resolve("DN")?.nombre).toBe("Distrito Nacional");
  });

  it("returns null when nothing matches", () => {
    expect(resolver.resolve("Atlantis")).toBeNull();
    expect(resolver.resolve("")).toBeNull();
    expect(resolver.resolve(null)).toBeNull();
  });

  it("prefers a configured name over another province's variant", () => {
    const own = buildProvinceResolver([
      { nombre: "La Romana", zona: "Este", active: true, aliases: ["Santiago"] },
      { nombre: "Santiago", zona: "Norte", active: true, aliases: [] },
    ]);
    expect(own.resolve("santiago")?.nombre).toBe("Santiago");
  });
});

describe("resolveProvinceAndZone", () => {
  const resolver = buildProvinceResolver(configs);

  it("returns the canonical name and the configured zone", () => {
    expect(resolveProvinceAndZone(resolver, "higuey", "Metro")).toEqual({ provincia: "Higuey", zona: "Este", matched: true });
  });

  it("keeps the trimmed raw value and the static zone without a configured match", () => {
    expect(resolveProvinceAndZone(resolver, " SANTIAGO ", "Metro")).toEqual({ provincia: "SANTIAGO", zona: "Norte", matched: false });
    expect(resolveProvinceAndZone(resolver, "Atlantis", "Metro")).toEqual({ provincia: "Atlantis", zona: "Metro", matched: false });
    expect(resolveProvinceAndZone(null, "Atlantis", "Sur")).toEqual({ provincia: "Atlantis", zona: "Sur", matched: false });
  });
});

describe("alias helpers", () => {
  it("sanitizes aliases: trims, drops empties, dedupes and drops the own name", () => {
    expect(sanitizeAliases("Higuey", [" HIGUEY ", "", "Higüey (MG)", "higuey (mg)", "Salvaleon"])).toEqual(["Higüey (MG)", "Salvaleon"]);
  });

  it("finds other provinces whose name or variant collides", () => {
    expect(findProvinceConflicts(["san pedro"], configs, "spm").map((row) => row.id)).toEqual(["sp"]);
    expect(findProvinceConflicts(["higuey (mg)"], configs, "spm").map((row) => row.id)).toEqual(["hig"]);
    expect(findProvinceConflicts(["san pedro de macoris"], configs, "spm")).toEqual([]);
  });

  it("merges absorbed names and variants into the target aliases", () => {
    expect(mergeAliases({ nombre: "Higuey", aliases: ["Salvaleon"] }, [{ nombre: "HIGUEY", aliases: ["La Otra"] }])).toEqual(["Salvaleon", "La Otra"]);
  });
});

describe("planDuplicateProvinceMerges", () => {
  it("keeps the mixed-case row and ORs the active flags", () => {
    const plans = planDuplicateProvinceMerges([
      { id: "a", nombre: "DISTRITO NACIONAL", zona: "Metro", active: true, aliases: ["DN"], createdAt: new Date("2025-01-01") },
      { id: "b", nombre: "Distrito Nacional", zona: "Metro", active: false, aliases: [], createdAt: new Date("2025-02-01") },
      { id: "c", nombre: "Santiago", zona: "Norte", active: true, aliases: [] },
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].keep.id).toBe("b");
    expect(plans[0].absorbed.map((row) => row.id)).toEqual(["a"]);
    expect(plans[0].aliases).toEqual(["DN"]);
    expect(plans[0].active).toBe(true);
  });

  it("keeps the oldest row on ties", () => {
    const [plan] = planDuplicateProvinceMerges([
      { id: "new", nombre: "Higüey", zona: "Este", active: true, aliases: [], createdAt: new Date("2025-03-01") },
      { id: "old", nombre: "Higuey", zona: "Este", active: true, aliases: [], createdAt: new Date("2025-01-01") },
    ]);
    expect(plan.keep.id).toBe("old");
    expect(plan.aliases).toEqual([]);
  });
});

describe("planStaticAliasSeeds", () => {
  it("never seeds an alias that names another configured province", () => {
    const seeds = planStaticAliasSeeds(configs, [
      ["SAN PEDRO", "San Pedro de Macoris"],
      ["DN", "Distrito Nacional"],
      ["DISTRITO NACIONAL", "Distrito Nacional"],
      ["BAVARO", "Punta Cana"],
    ]);
    expect(seeds).toEqual([expect.objectContaining({ added: ["DN"], aliases: ["DN"] })]);
    expect(seeds[0].config.id).toBe("dn");
  });
});

describe("planProvinceNormalization", () => {
  const rows = [
    { id: "a", nombre: "DISTRITO NACIONAL", zona: "Metro", active: true, aliases: [], createdAt: new Date("2025-01-01") },
    { id: "b", nombre: "Distrito Nacional", zona: "Metro", active: true, aliases: [], createdAt: new Date("2025-02-01") },
    { id: "h", nombre: "Higuey", zona: "Este", active: true, aliases: [], createdAt: new Date("2025-01-01") },
  ];
  const statics: Array<[string, string]> = [["DN", "Distrito Nacional"], ["HIGÜEY", "Higuey"]];

  it("merges duplicates, seeds safe variants and plans the reference rewrites", () => {
    const plan = planProvinceNormalization(rows, { "Card.provincia": ["DISTRITO NACIONAL", "DN", "HIGUEY", "Higuey", "Atlantis"] }, statics);
    expect(plan.merges.map((merge) => merge.keep.id)).toEqual(["b"]);
    expect(plan.finalConfigs.find((row) => row.id === "b")?.aliases).toEqual(["DN"]);
    expect(plan.rewrites["Card.provincia"].map((item) => [item.from, item.to.nombre])).toEqual([
      ["DISTRITO NACIONAL", "Distrito Nacional"],
      ["DN", "Distrito Nacional"],
      ["HIGUEY", "Higuey"],
    ]);
  });

  it("is idempotent: the normalized result plans nothing", () => {
    const first = planProvinceNormalization(rows, { "Card.provincia": ["DISTRITO NACIONAL", "DN"] }, statics);
    const second = planProvinceNormalization(first.finalConfigs, { "Card.provincia": ["Distrito Nacional"] }, statics);
    expect(second.merges).toEqual([]);
    expect(second.seeds).toEqual([]);
    expect(second.rewrites).toEqual({});
  });
});
