import { CardProductType, CardStatus, Prisma } from "@prisma/client";
import { compileCardGroupWhere } from "@/lib/list-query/card-group-where";

/**
 * Facet keys the "Mis gestiones" list accepts (subset of the shared
 * `llamadas` facet set in `lib/filters/card-facets.ts`; `asignado` is left out
 * because the list is already scoped to one operator).
 */
export const MIS_GESTIONES_FACET_PARAMS = [
  "contactoEstado",
  "canalContacto",
  "status",
  "productType",
  "provincia",
  "zona",
  "messengerId",
  "grupo",
  "urgent",
] as const;

const CARD_STATUSES = new Set<string>(Object.values(CardStatus));

function listParam(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key)?.trim();
  if (!raw || raw === "ALL") return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** `contactoEstado` facet -> constraint on `metadata.operativo` (same rule as SLA vencidas). */
function contactoEstadoWhere(value: string | null): Prisma.CardWhereInput | undefined {
  switch (value) {
    case "CONTACTADA":
      return { metadata: { path: ["operativo", "contactado"], equals: true } };
    case "RETORNO_SOLICITADO":
      return { metadata: { path: ["operativo", "solicitudRetorno"], equals: true } };
    case "TRASLADO_SOLICITADO":
      return { metadata: { path: ["operativo", "traslado", "provinciaDestino"], not: Prisma.AnyNull } };
    case "NO_CONTACTADA":
      return { NOT: { metadata: { path: ["operativo", "contactado"], equals: true } } };
    default:
      return undefined;
  }
}

/** Translates the call-list facet params into `Card` constraints; unknown or empty values add nothing. */
export function buildCallFacetWhere(params: URLSearchParams): Prisma.CardWhereInput[] {
  const clauses: Prisma.CardWhereInput[] = [];

  const provincias = listParam(params, "provincia");
  if (provincias.length) clauses.push({ provincia: { in: provincias } });

  const zonas = listParam(params, "zona");
  if (zonas.length) clauses.push({ zona: { in: zonas } });

  const statuses = listParam(params, "status").filter((value) => CARD_STATUSES.has(value)) as CardStatus[];
  if (statuses.length) clauses.push({ status: { in: statuses } });

  const productType = params.get("productType");
  if (productType === CardProductType.CREDITO || productType === CardProductType.DEBITO) {
    clauses.push({ productType });
  }

  const messengerId = params.get("messengerId")?.trim();
  if (messengerId && messengerId !== "ALL") clauses.push({ currentMessengerId: messengerId });

  const grupo = compileCardGroupWhere(params);
  if (grupo) clauses.push(grupo);

  const contacto = contactoEstadoWhere(params.get("contactoEstado"));
  if (contacto) clauses.push(contacto);

  const canal = params.get("canalContacto");
  if (canal === "WHATSAPP" || canal === "LLAMADA_DIRECTA") {
    clauses.push({ metadata: { path: ["operativo", "canalContacto"], equals: canal } });
  }

  if (params.get("urgent") === "1") clauses.push({ urgent: true });

  return clauses;
}
