import { PROVINCIAS_INICIALES } from "@/lib/constants";
import { normalizeText } from "@/lib/utils";

const provinceToZone = new Map<string, string>();

for (const p of PROVINCIAS_INICIALES) {
  provinceToZone.set(normalizeText(p.nombre), p.zona);
}

const provinceAliases = [
  // ── Metro: Santo Domingo y Distrito Nacional ───────────────────────────
  ["DISTRITO NACIONAL",                        "Distrito Nacional"],
  ["DISTRITO",                                 "Distrito Nacional"],
  ["DN",                                       "Distrito Nacional"],
  ["SANTO DOMINGO DE GUZMAN",                  "Santo Domingo"],
  ["SANTO DOMINGO ESTE",                       "Santo Domingo"],
  ["SANTO DOMINGO OESTE",                      "Santo Domingo"],
  ["SANTO DOMINGO NORTE",                      "Santo Domingo"],
  ["SANTO DOMINGO",                            "Santo Domingo"],
  ["MONTE PLATA",                              "Monte Plata"],
  // ── Este ──────────────────────────────────────────────────────────────
  ["LA ROMANA",                                "La Romana"],
  ["ROMANA",                                   "La Romana"],
  ["LA ALTAGRACIA",                            "La Altagracia"],
  ["ALTAGRACIA",                               "La Altagracia"],
  ["HIGUEY",                                   "Higuey"],
  ["HIGUEY (MG)",                              "Higuey"],
  ["HIGÜEY",                                   "Higuey"],
  ["SAN PEDRO DE MACORIS",                     "San Pedro de Macoris"],
  ["SAN PEDRO DE MACORÍS",                     "San Pedro de Macoris"],
  ["SAN PEDRO",                                "San Pedro de Macoris"],
  ["HATO MAYOR",                               "Hato Mayor"],
  ["EL SEIBO",                                 "El Seibo"],
  ["SEIBO",                                    "El Seibo"],
  ["PUNTA CANA",                               "Punta Cana"],
  ["BAVARO",                                   "Punta Cana"],
  ["BÁVARO",                                   "Punta Cana"],
  // ── Norte: Santiago y subregiones ─────────────────────────────────────
  ["SANTIAGO",                                 "Santiago"],
  ["SANTIAGO DE LOS CABALLEROS",               "Santiago"],
  ["BISONO",                                   "Santiago"],
  ["BISONÓ",                                   "Santiago"],
  ["PUERTO PLATA",                             "Puerto Plata"],
  ["LA VEGA",                                  "La Vega"],
  ["VEGA",                                     "La Vega"],
  ["ESPAILLAT",                                "Espaillat"],
  ["MOCA",                                     "Espaillat"],
  ["MONSENOR NOUEL",                           "Monsenor Nouel"],
  ["MONSEÑOR NOUEL",                           "Monsenor Nouel"],
  ["BONAO",                                    "Monsenor Nouel"],
  ["SAN FRANCISCO DE MACORIS",                 "San Francisco de Macoris"],
  ["SAN FRANCISCO DE MACORÍS",                 "San Francisco de Macoris"],
  ["SAN FRANCISCO",                            "San Francisco de Macoris"],
  ["DUARTE",                                   "Duarte"],
  ["MARIA TRINIDAD SANCHEZ",                   "Maria Trinidad Sanchez"],
  ["MARÍA TRINIDAD SÁNCHEZ",                   "Maria Trinidad Sanchez"],
  ["NAGUA",                                    "Maria Trinidad Sanchez"],
  ["HERMANAS MIRABAL",                         "Hermanas Mirabal"],
  ["SALCEDO",                                  "Hermanas Mirabal"],
  ["SANCHEZ RAMIREZ",                          "Sanchez Ramirez"],
  ["SÁNCHEZ RAMÍREZ",                          "Sanchez Ramirez"],
  ["COTUI",                                    "Sanchez Ramirez"],
  ["COTUÍ",                                    "Sanchez Ramirez"],
  ["SAMANA",                                   "Samana"],
  ["SAMANÁ",                                   "Samana"],
  ["MONTECRISTI",                              "Montecristi"],
  ["MONTE CRISTI",                             "Montecristi"],
  ["DAJABON",                                  "Dajabon"],
  ["DAJABÓN",                                  "Dajabon"],
  ["VALVERDE",                                 "Valverde"],
  ["MAO",                                      "Valverde"],
  ["SANTIAGO RODRIGUEZ",                       "Santiago Rodriguez"],
  ["SANTIAGO RODRÍGUEZ",                       "Santiago Rodriguez"],
  // ── Sur ───────────────────────────────────────────────────────────────
  ["SAN CRISTOBAL",                            "San Cristobal"],
  ["SAN CRISTÓBAL",                            "San Cristobal"],
  ["BANI",                                     "Bani"],
  ["BANÍ",                                     "Bani"],
  ["PERAVIA",                                  "Bani"],
  ["AZUA",                                     "Azua"],
  ["SAN JOSE DE OCOA",                         "San Jose de Ocoa"],
  ["SAN JOSÉ DE OCOA",                         "San Jose de Ocoa"],
  ["SAN JUAN",                                 "San Juan"],
  ["SAN JUAN DE LA MAGUANA",                   "San Juan"],
  ["BARAHONA",                                 "Barahona"],
  ["BAHORUCO",                                 "Bahoruco"],
  ["INDEPENDENCIA",                            "Independencia"],
  ["PEDERNALES",                               "Pedernales"],
  ["ELIAS PINA",                               "Elias Pina"],
  ["ELÍAS PIÑA",                               "Elias Pina"],
  ["COMENDADOR",                               "Elias Pina"],
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
