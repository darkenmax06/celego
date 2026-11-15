import { normalizeText } from "@/lib/utils";
import { resolveProvinceAlias, resolveZone, STATIC_PROVINCE_ALIASES } from "@/lib/zone-map";

export type ProvinceConfigLike = {
  id?: string;
  nombre: string;
  zona: string;
  active: boolean;
  aliases?: string[] | null;
  createdAt?: Date;
};

export type ResolvedProvince = { nombre: string; zona: string; active: boolean };

export type ProvinceResolver = {
  /** Canonical configured province for a raw value, or null when no config matches. */
  resolve(raw: string | null | undefined): ResolvedProvince | null;
};

/**
 * Matches raw province strings against ProvinceConfig names and aliases,
 * ignoring case and accents. Inactive provinces still match (imports accept
 * them and warn). A configured name always wins over another row's alias.
 * When nothing matches directly, the static spelling table is tried once
 * ("DN" -> "Distrito Nacional") so a configured province still resolves.
 */
export function buildProvinceResolver(configs: ProvinceConfigLike[]): ProvinceResolver {
  const byKey = new Map<string, ResolvedProvince>();
  const entry = (config: ProvinceConfigLike): ResolvedProvince => ({
    nombre: config.nombre,
    zona: config.zona,
    active: config.active,
  });
  for (const config of configs) {
    const key = normalizeText(config.nombre);
    if (key && !byKey.has(key)) byKey.set(key, entry(config));
  }
  for (const config of configs) {
    for (const alias of config.aliases ?? []) {
      const key = normalizeText(alias);
      if (key && !byKey.has(key)) byKey.set(key, entry(config));
    }
  }

  return {
    resolve(raw) {
      if (!raw?.trim() || !byKey.size) return null;
      const direct = byKey.get(normalizeText(raw));
      if (direct) return direct;
      return byKey.get(normalizeText(resolveProvinceAlias(raw))) ?? null;
    },
  };
}

type ProvinceConfigReader = {
  provinceConfig: {
    findMany: (args: {
      select: { nombre: true; zona: true; active: true; aliases: true };
    }) => Promise<Array<{ nombre: string; zona: string; active: boolean; aliases?: string[] | null }>>;
  };
};

/** One query per import: every ProvinceConfig row, active or not. */
export async function loadProvinceResolver(db: ProvinceConfigReader) {
  const rows = await db.provinceConfig.findMany({
    select: { nombre: true, zona: true, active: true, aliases: true },
  });
  return buildProvinceResolver(rows);
}

/**
 * Canonical province name and zone for a raw value. Without a configured
 * match the trimmed raw value is kept and the zone comes from the static map
 * (or `fallbackZona`), exactly as before ProvinceConfig aliases existed.
 */
export function resolveProvinceAndZone(
  resolver: ProvinceResolver | null | undefined,
  raw: string | null | undefined,
  fallbackZona: string,
) {
  const trimmed = raw?.trim() ?? "";
  const match = resolver?.resolve(trimmed) ?? null;
  if (match) return { provincia: match.nombre, zona: match.zona, matched: true as const };
  return { provincia: trimmed, zona: resolveZone(trimmed, fallbackZona), matched: false as const };
}

/** Trims, drops empties, dedupes (normalized) and drops aliases equal to the province's own name. */
export function sanitizeAliases(nombre: string, aliases: string[] | null | undefined) {
  const own = normalizeText(nombre);
  const seen = new Set<string>([own]);
  const result: string[] = [];
  for (const alias of aliases ?? []) {
    const trimmed = alias.trim();
    const key = normalizeText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Normalized keys a province answers to: its name plus every alias. */
export function provinceKeys(config: Pick<ProvinceConfigLike, "nombre" | "aliases">) {
  return new Set([config.nombre, ...(config.aliases ?? [])].map(normalizeText).filter(Boolean));
}

/** Other provinces whose name or alias equals (normalized) any of `names`. */
export function findProvinceConflicts<T extends ProvinceConfigLike & { id: string }>(
  names: string[],
  configs: T[],
  excludeId?: string,
) {
  const wanted = new Set(names.map(normalizeText).filter(Boolean));
  return configs.filter((config) => {
    if (config.id === excludeId) return false;
    for (const key of provinceKeys(config)) if (wanted.has(key)) return true;
    return false;
  });
}

/** Merges absorbed provinces' names and aliases into the target's alias list. */
export function mergeAliases(
  target: Pick<ProvinceConfigLike, "nombre" | "aliases">,
  absorbed: Array<Pick<ProvinceConfigLike, "nombre" | "aliases">>,
) {
  return sanitizeAliases(target.nombre, [
    ...(target.aliases ?? []),
    ...absorbed.flatMap((row) => [row.nombre, ...(row.aliases ?? [])]),
  ]);
}

function isAllUpper(value: string) {
  return value === value.toUpperCase() && value !== value.toLowerCase();
}

export type DuplicateMergePlan<T> = {
  keep: T;
  absorbed: T[];
  aliases: string[];
  active: boolean;
};

/**
 * Groups ProvinceConfig rows whose names are equal ignoring case and accents.
 * The kept row is the one not written in all caps (mixed case preferred),
 * oldest first on ties; the others become aliases and are deleted.
 */
export function planDuplicateProvinceMerges<T extends ProvinceConfigLike & { id: string }>(configs: T[]) {
  const groups = new Map<string, T[]>();
  for (const config of configs) {
    const key = normalizeText(config.nombre);
    groups.set(key, [...(groups.get(key) ?? []), config]);
  }
  const plans: DuplicateMergePlan<T>[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const upper = Number(isAllUpper(a.nombre)) - Number(isAllUpper(b.nombre));
      if (upper !== 0) return upper;
      return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
    });
    const [keep, ...absorbed] = sorted;
    plans.push({
      keep,
      absorbed,
      aliases: mergeAliases(keep, absorbed),
      active: group.some((row) => row.active),
    });
  }
  return plans;
}

/**
 * Static aliases to add to configured provinces: only when the alias target is
 * a configured name and the alias is not another configured province's name
 * or alias (distinct provinces are never merged automatically).
 */
export function planStaticAliasSeeds<T extends ProvinceConfigLike & { id: string }>(
  configs: T[],
  staticAliases: ReadonlyArray<readonly [string, string]> = STATIC_PROVINCE_ALIASES,
) {
  const byName = new Map(configs.map((config) => [normalizeText(config.nombre), config]));
  const owner = new Map<string, string>();
  for (const config of configs) for (const key of provinceKeys(config)) if (!owner.has(key)) owner.set(key, config.id);

  const additions = new Map<string, string[]>();
  for (const [alias, canonical] of staticAliases) {
    const target = byName.get(normalizeText(canonical));
    if (!target) continue;
    const key = normalizeText(alias);
    const existingOwner = owner.get(key);
    if (existingOwner) continue; // already the target's own key, or belongs to another province
    owner.set(key, target.id);
    additions.set(target.id, [...(additions.get(target.id) ?? []), alias]);
  }
  return configs
    .filter((config) => additions.has(config.id))
    .map((config) => ({
      config,
      added: additions.get(config.id)!,
      aliases: sanitizeAliases(config.nombre, [...(config.aliases ?? []), ...additions.get(config.id)!]),
    }));
}

/** Stored values that resolve to a different canonical spelling: [from, to] pairs. */
export function planValueRewrites(values: Array<string | null | undefined>, resolver: ProvinceResolver) {
  const rewrites = new Map<string, ResolvedProvince>();
  for (const value of values) {
    if (typeof value !== "string" || rewrites.has(value)) continue;
    const match = resolver.resolve(value);
    if (match && match.nombre !== value) rewrites.set(value, match);
  }
  return rewrites;
}
