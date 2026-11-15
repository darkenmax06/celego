import {
  buildProvinceResolver,
  planDuplicateProvinceMerges,
  planStaticAliasSeeds,
  planValueRewrites,
  type ProvinceConfigLike,
  type ResolvedProvince,
} from "@/lib/province-resolver";

export type PlannedConfig = ProvinceConfigLike & { id: string; aliases: string[] };

/**
 * Pure plan for scripts/normalize-provinces.ts:
 *  a. merge ProvinceConfig rows that differ only by case/accents,
 *  b. seed variants from the static alias table where safe,
 *  c. rewrite stored references to the canonical spelling.
 * Running it on already-normalized data yields an empty plan.
 */
export function planProvinceNormalization(
  configs: PlannedConfig[],
  referenceValues: Record<string, string[]>,
  staticAliases?: ReadonlyArray<readonly [string, string]>,
) {
  const merges = planDuplicateProvinceMerges(configs);
  const absorbedIds = new Set(merges.flatMap((plan) => plan.absorbed.map((row) => row.id)));
  const mergedById = new Map(merges.map((plan) => [plan.keep.id, plan]));
  const afterMerge: PlannedConfig[] = configs
    .filter((config) => !absorbedIds.has(config.id))
    .map((config) => {
      const plan = mergedById.get(config.id);
      return plan ? { ...config, aliases: plan.aliases, active: plan.active } : config;
    });

  const seeds = planStaticAliasSeeds(afterMerge, staticAliases);
  const seededById = new Map(seeds.map((seed) => [seed.config.id, seed.aliases]));
  const finalConfigs = afterMerge.map((config) =>
    seededById.has(config.id) ? { ...config, aliases: seededById.get(config.id)! } : config,
  );

  const resolver = buildProvinceResolver(finalConfigs);
  const rewrites: Record<string, Array<{ from: string; to: ResolvedProvince }>> = {};
  for (const [label, values] of Object.entries(referenceValues)) {
    const planned = planValueRewrites(values, resolver);
    if (planned.size) rewrites[label] = [...planned.entries()].map(([from, to]) => ({ from, to }));
  }

  return { merges, seeds, finalConfigs, rewrites };
}
