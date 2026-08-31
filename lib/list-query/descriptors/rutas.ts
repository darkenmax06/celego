import type { Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Mirrors `app/api/rutas/route.ts` GET as it behaves TODAY.
 * Page size 20 default / 100 max; ordering `fecha desc, createdAt desc`.
 *
 * Task 10.10 reconciliation — the Phase 9 draft was a superset and was narrowed:
 * - REMOVED `status`: the route reads only `date` and `messengerId`.
 * - REMOVED the `q` search fields: the route has no free-text search.
 * - `from`/`to` REPLACED by the single `date` param the route actually accepts.
 * - `messengerId` takes `sentinel: false` because the route applies any
 *   non-empty value and never treated `"ALL"` as "no filter".
 */
export const rutasListQuery = defineListQuery<Prisma.RouteWhereInput>({
  key: "rutas",
  searchFields: [],
  filters: [
    { kind: "string", param: "messengerId", field: "messengerId", sentinel: false },
    { kind: "day", param: "date", field: "fecha" },
  ],
  sort: {
    keys: {},
    fallbackOrderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
  },
  pagination: { defaultPageSize: 20, maxPageSize: 100 },
});
