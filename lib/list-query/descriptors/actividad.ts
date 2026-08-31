import type { Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Mirrors `app/api/config/usuarios/[id]/actividad/route.ts` GET as it behaves
 * TODAY. Page size 25 default / 100 max; ordering `createdAt desc`.
 *
 * Task 10.10 reconciliation:
 * - REMOVED the `q` search fields: the route has no free-text search. This also
 *   keeps `where.OR` free, which matters because the route reserves `OR` for its
 *   mandatory `[{ userId }, { targetUserId }]` authorization scope; a compiled
 *   search would have OVERWRITTEN that scope.
 * - `action`/`result` take `sentinel: false`: the route applies any non-empty
 *   value and has no `"ALL"` sentinel.
 * - `from`/`to` use LOCAL day boundaries, matching the route's
 *   `T00:00:00` / `T23:59:59.999` suffixes with no zone.
 */
export const actividadListQuery = defineListQuery<Prisma.AuditLogWhereInput>({
  key: "actividad",
  searchFields: [],
  filters: [
    { kind: "string", param: "action", field: "action", sentinel: false },
    { kind: "string", param: "result", field: "result", sentinel: false },
    {
      kind: "dateRange",
      field: "createdAt",
      fromParam: "from",
      toParam: "to",
      boundaries: "localDay",
    },
  ],
  sort: {
    keys: {},
    fallbackOrderBy: [{ createdAt: "desc" }],
  },
  pagination: { defaultPageSize: 25, maxPageSize: 100 },
});
