import { normalizeText } from "@/lib/utils";
import { resolveProvinceAlias } from "@/lib/zone-map";

export type InactiveProvinceSummary = { count: number; names: string[] };

type ProvinceConfigReader = {
  provinceConfig: {
    findMany: (args: { where: { active: false }; select: { nombre: true } }) => Promise<{ nombre: string }[]>;
  };
};

/** Names of the provinces configured as inactive; imports still accept them but warn. */
export async function loadInactiveProvinceNames(db: ProvinceConfigReader) {
  const rows = await db.provinceConfig.findMany({ where: { active: false }, select: { nombre: true } });
  return rows.map((row) => row.nombre);
}

/**
 * Counts the imported provinces that match an inactive ProvinceConfig, either
 * directly or through the importers' aliases (e.g. "DN" -> "Distrito Nacional").
 * Names come back with the configured spelling, once each, in first-seen order.
 */
export function countInactiveProvinceRows(
  provinces: Array<string | null | undefined>,
  inactive: string[],
): InactiveProvinceSummary {
  const byKey = new Map(inactive.map((name) => [normalizeText(name), name]));
  const names = new Set<string>();
  let count = 0;
  if (!byKey.size) return { count, names: [] };

  for (const province of provinces) {
    if (!province?.trim()) continue;
    const match = byKey.get(normalizeText(province)) ?? byKey.get(normalizeText(resolveProvinceAlias(province)));
    if (!match) continue;
    count += 1;
    names.add(match);
  }
  return { count, names: [...names] };
}

/** Spanish warning for the import result, or null when no row had an inactive province. */
export function formatInactiveProvinceWarning(count: number | undefined, names: string[] | undefined) {
  if (!count) return null;
  const subject = count === 1 ? "1 fila vino" : `${count} filas vinieron`;
  const detail = names?.length ? ` (${names.join(", ")})` : "";
  return `${subject} con provincia inactiva${detail}.`;
}
