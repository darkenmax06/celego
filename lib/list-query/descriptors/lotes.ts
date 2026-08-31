import type { Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Mirrors `app/api/lotes/route.ts` GET as it behaves TODAY.
 * Page size 20 default / 100 max; ordering `fechaEnvio desc, createdAt desc`.
 *
 * Task 10.10 reconciliation:
 * - REMOVED the `q` search fields: the route has no free-text search.
 * - `from`/`to` REPLACED by the single `date` param the route accepts.
 * - `estatus` stays a free-form String column on `Lot`, not a Prisma enum, and
 *   the route DOES honour the `"ALL"` sentinel for it.
 */
export const lotesListQuery = defineListQuery<Prisma.LotWhereInput>({
  key: "lotes",
  searchFields: [],
  filters: [
    { kind: "string", param: "status", field: "estatus" },
    { kind: "day", param: "date", field: "fechaEnvio" },
  ],
  sort: {
    keys: {},
    fallbackOrderBy: [{ fechaEnvio: "desc" }, { createdAt: "desc" }],
  },
  pagination: { defaultPageSize: 20, maxPageSize: 100 },
});
