import { CardStatus, type Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Mirrors the `activos` LIST path of `app/api/operativo/contacto/route.ts` GET.
 * Page size 25 default / 100 max.
 *
 * Task 10.10 reconciliation:
 * - `fallbackOrderBy` CORRECTED. The Phase 9 draft said `updatedAt desc`; the
 *   route actually orders `urgent desc, slaDueDate asc, updatedAt desc`. Had the
 *   route been migrated against the draft, every operator would have seen a
 *   different first page.
 * - Sort keys removed: the route accepts no `sort` param today.
 *
 * MIGRATED in task 10.7. The three Phase 10 blockers were closed like this:
 *  1. AND-composition. The route wraps mandatory clauses in `AND: [...]` — the
 *     closed-status exclusion and the `slaDueDate` window from the clamped
 *     `days` param — and that window uses the SAME top-level `OR` key the
 *     free-text search writes. `compile()` now takes `andPrefix`/`andSuffix`
 *     and emits every compiled clause as a conjunct, so the search can no
 *     longer overwrite a mandatory clause.
 *  2. `parseCardStatusFilter`'s third outcome (`null` => empty page) stays in
 *     the route, where it belongs: it short-circuits BEFORE any query. The
 *     filter is therefore `onInvalid: "drop"`, which is what the compiled
 *     `where` must do for the `urgentes` tab, whose status filtering happens in
 *     memory via `matchesStatusFilter` and must NOT short-circuit.
 *  3. The `urgentes` tab still paginates its merged result IN MEMORY. It takes
 *     only `page`/`pageSize` from this descriptor; no Prisma `skip`/`take` is
 *     equivalent to slicing two merged sources.
 *
 * `fallbackOrderBy` is the route's verified ordering and MUST stay exact.
 */
export const operativoContactoListQuery = defineListQuery<Prisma.CardWhereInput>({
  key: "operativo-contacto",
  searchFields: ["tc", "externalReference", "customer.cedula", "customer.nombre"],
  filters: [
    {
      kind: "enum",
      param: "status",
      field: "status",
      values: Object.values(CardStatus),
      // The route rejects an unknown status by short-circuiting to an empty
      // page, never by letting compile() throw. See (2) above.
      onInvalid: "drop",
    },
    { kind: "string", param: "provincia", field: "provincia" },
  ],
  sort: {
    keys: {},
    fallbackOrderBy: [{ urgent: "desc" }, { slaDueDate: "asc" }, { updatedAt: "desc" }],
  },
  pagination: { defaultPageSize: 25, maxPageSize: 100 },
});
