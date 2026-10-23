import { ASIGNADO_SIN_ASIGNAR } from "@/lib/filters/card-facets";

/**
 * Filters for the "Asignar gestiones" list. That list is a pasted batch kept
 * in the browser, not a server query, so the filters run here over the
 * resolved cards using the same keys the shared card facets emit.
 */

export type AssignFilterCard = {
  tc: string;
  status: string;
  productType?: string;
  provincia?: string | null;
  zona?: string | null;
  customer: { nombre: string; cedula: string };
  asignadoA?: { id: string; name: string } | null;
};

function listValues(value: string | undefined) {
  return (value ?? "").split(",").filter(Boolean);
}

export function filterAssignCards<T extends AssignFilterCard>(cards: T[], filters: Record<string, string>): T[] {
  const q = filters.q?.trim().toLowerCase();
  const statuses = listValues(filters.status);
  const provincias = listValues(filters.provincia);
  const zonas = listValues(filters.zona);
  return cards.filter((card) => {
    if (q && ![card.tc, card.customer.nombre, card.customer.cedula].some((value) => value.toLowerCase().includes(q))) {
      return false;
    }
    if (statuses.length && !statuses.includes(card.status)) return false;
    if (filters.productType && card.productType !== filters.productType) return false;
    if (provincias.length && !provincias.includes(card.provincia ?? "")) return false;
    if (zonas.length && !zonas.includes(card.zona ?? "")) return false;
    if (filters.asignado === ASIGNADO_SIN_ASIGNAR) return !card.asignadoA;
    if (filters.asignado && card.asignadoA?.id !== filters.asignado) return false;
    return true;
  });
}
