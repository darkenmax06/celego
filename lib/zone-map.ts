import { PROVINCIAS_INICIALES } from "@/lib/constants";
import { normalizeText } from "@/lib/utils";

const provinceToZone = new Map<string, string>();

for (const p of PROVINCIAS_INICIALES) {
  provinceToZone.set(normalizeText(p.nombre), p.zona);
}

const provinceAliases = [
  ["SAN PEDRO DE MACORIS", "San Pedro de Macoris"],
  ["SAN PEDRO", "San Pedro"],
  ["ROMANA", "La Romana"],
  ["LA ROMANA", "La Romana"],
  ["HIGUEY", "Higuey"],
  ["HIGUEY (MG)", "Higuey"],
  ["LA ALTAGRACIA", "Higuey"],
  ["SAN FRANCISCO DE MACORIS", "San Francisco de Macoris"],
  ["SAN FRANCISCO", "San Francisco de Macoris"],
  ["SAN CRISTOBAL", "San Cristobal"],
  ["BANI", "Bani"],
] as const;

for (const [alias, canonical] of provinceAliases) {
  const zone = provinceToZone.get(normalizeText(canonical));
  if (zone) {
    provinceToZone.set(normalizeText(alias), zone);
  }
}

export function resolveZone(provinceRaw: string, fallback = "Metro") {
  const key = normalizeText(provinceRaw);
  return provinceToZone.get(key) ?? fallback;
}
