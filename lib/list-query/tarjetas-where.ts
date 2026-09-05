import { Prisma } from "@prisma/client";
import { compile, type CompiledListQuery, ListQueryValidationError } from "@/lib/list-query";
import { tarjetasListQuery } from "@/lib/list-query/descriptors/tarjetas";

/**
 * SDD card-groups remediation — FIX 2.
 *
 * Single source of truth for "does this `Card` match the active `/tarjetas`
 * filter set", shared by `GET /api/tarjetas` and
 * `POST /api/tarjetas/off-filter-count`. `contactoEstado` is not a
 * `list-query` filter kind (it reads a JSON `metadata` path), so it is
 * composed here exactly as the list route already composed it — reusing this
 * function is what keeps the off-filter count from drifting out of sync with
 * what the list itself considers "in filter".
 */
export function compileTarjetasWhere(
  params: URLSearchParams,
): { query: CompiledListQuery<Prisma.CardWhereInput>; where: Prisma.CardWhereInput } {
  const query = compile(tarjetasListQuery, params);

  const contactoEstadoParam = params.get("contactoEstado");
  let contactoConstraint: Prisma.CardWhereInput | undefined;
  if (contactoEstadoParam && contactoEstadoParam !== "ALL") {
    if (contactoEstadoParam === "CONTACTADA") {
      contactoConstraint = {
        metadata: { path: ["operativo", "contactado"], equals: true },
      };
    } else if (contactoEstadoParam === "RETORNO_SOLICITADO") {
      contactoConstraint = {
        metadata: { path: ["operativo", "solicitudRetorno"], equals: true },
      };
    } else if (contactoEstadoParam === "TRASLADO_SOLICITADO") {
      contactoConstraint = {
        metadata: { path: ["operativo", "traslado", "provinciaDestino"], not: Prisma.AnyNull },
      };
    } else if (contactoEstadoParam === "NO_CONTACTADA") {
      contactoConstraint = {
        NOT: { metadata: { path: ["operativo", "contactado"], equals: true } },
      };
    }
  }

  const where: Prisma.CardWhereInput = contactoConstraint
    ? { AND: [query.where, contactoConstraint] }
    : query.where;

  return { query, where };
}

export { ListQueryValidationError };
