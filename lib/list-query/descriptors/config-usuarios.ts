import { UserRole, type Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Mirrors `app/api/config/usuarios/route.ts` GET as it behaves TODAY.
 * Page size 20 default / 100 max; ordering `active desc, name asc, createdAt asc`.
 *
 * Task 10.10 reconciliation:
 * - `active` uses the `"true"`/`"false"` encoding this route has always
 *   accepted, NOT the `"1"`/`"0"` binary encoding the Phase 9 draft assumed.
 * - `role` drops an unknown value silently, matching the route's
 *   `Object.values(UserRole).includes(role)` guard.
 * - Sort keys removed: the route accepts no `sort` param today.
 */
export const configUsuariosListQuery = defineListQuery<Prisma.UserWhereInput>({
  key: "config-usuarios",
  searchFields: ["name", "email"],
  filters: [
    {
      kind: "enum",
      param: "role",
      field: "role",
      values: Object.values(UserRole),
      onInvalid: "drop",
    },
    { kind: "boolean", param: "active", field: "active", encoding: "literal" },
  ],
  sort: {
    keys: {},
    fallbackOrderBy: [{ active: "desc" }, { name: "asc" }, { createdAt: "asc" }],
  },
  pagination: { defaultPageSize: 20, maxPageSize: 100 },
});
