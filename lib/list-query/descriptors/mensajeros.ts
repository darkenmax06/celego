import type { Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Mirrors `app/api/mensajeros/route.ts` GET as it behaves TODAY.
 *
 * `allowUnpaginated` is load bearing: omitting BOTH `page` and `pageSize`
 * returns the full `{ messengers }` set with NO `pagination` key, and several
 * callers (rutas, redaccion, card pickers) depend on that shape.
 *
 * Task 10.10 reconciliation:
 * - REMOVED `zona` and the `q` search fields: the route accepts neither.
 * - `onlyActive` is `truthyOnly`; the route compares `=== "1"` and `"0"` has
 *   never meant `activo: false`.
 * - `province` is case-insensitive, matching `{ equals, mode: "insensitive" }`,
 *   and takes `sentinel: false` because the route applies any non-empty value
 *   and has never treated `"ALL"` as "no filter".
 */
export const mensajerosListQuery = defineListQuery<Prisma.MessengerWhereInput>({
  key: "mensajeros",
  searchFields: [],
  filters: [
    { kind: "boolean", param: "onlyActive", field: "activo", truthyOnly: true },
    {
      kind: "string",
      param: "province",
      field: "provinciaTrabajo",
      insensitive: true,
      sentinel: false,
    },
  ],
  sort: {
    keys: {},
    fallbackOrderBy: [{ nombre: "asc" }],
  },
  pagination: { defaultPageSize: 25, maxPageSize: 100 },
  allowUnpaginated: true,
});
