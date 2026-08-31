import { DispatchOrigin, RedactionStatus, RedactionType, type Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Mirrors `app/api/redacciones/route.ts` GET as it behaves TODAY.
 * Page size 20 default / 100 max; ordering `createdAt desc`.
 *
 * Task 10.10 reconciliation:
 * - REMOVED the `q` search fields: the route has no free-text search.
 * - `from`/`to` REPLACED by the single `date` param the route accepts.
 * - `status`/`tipo`/`origin` keep enum validation. The route passes the raw
 *   string straight to Prisma today, so an unknown value already fails the
 *   request; rejecting it here turns that failure into a deliberate 400. This is
 *   the one intentional behaviour change in this descriptor and it is recorded,
 *   not silent.
 */
export const redaccionesListQuery = defineListQuery<Prisma.RedactionWhereInput>({
  key: "redacciones",
  searchFields: [],
  filters: [
    { kind: "enum", param: "status", field: "status", values: Object.values(RedactionStatus) },
    { kind: "string", param: "zona", field: "zona" },
    { kind: "enum", param: "tipo", field: "tipo", values: Object.values(RedactionType) },
    { kind: "enum", param: "origin", field: "dispatchOrigin", values: Object.values(DispatchOrigin) },
    { kind: "day", param: "date", field: "fecha" },
  ],
  sort: {
    keys: {},
    fallbackOrderBy: [{ createdAt: "desc" }],
  },
  pagination: { defaultPageSize: 20, maxPageSize: 100 },
});
