import type { Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Mirrors `app/api/status-digitales/bizcochitos/route.ts` GET as it behaves
 * TODAY. Page size 15 default / 50 max; ordering `generatedAt desc, sequence desc`.
 *
 * Task 10.10 reconciliation: the route accepts NO filters, no search and no
 * sort, and its `count()` runs with no `where` at all. The Phase 9 draft's
 * `generatedAt` range and sort keys were pure new surface and were removed.
 */
export const bizcochitosListQuery = defineListQuery<Prisma.BizcochitoBatchWhereInput>({
  key: "bizcochitos",
  searchFields: [],
  filters: [],
  sort: {
    keys: {},
    fallbackOrderBy: [{ generatedAt: "desc" }, { sequence: "desc" }],
  },
  pagination: { defaultPageSize: 15, maxPageSize: 50 },
});
