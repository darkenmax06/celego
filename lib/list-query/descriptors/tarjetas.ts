import { CardProductType, CardStatus, DispatchOrigin, type Prisma } from "@prisma/client";
import { toCardStatus } from "../../card-status";
import { defineListQuery } from "../compile";

/**
 * Mirrors `app/api/tarjetas/route.ts` GET.
 * Page size 25 default / 200 max; current ordering `updatedAt desc`.
 *
 * Task 10.10 reconciliation — narrowed where it was provably wider:
 * - `urgent` is `truthyOnly`: the route only ever wrote `where.urgent = true`
 *   for `"1"` and IGNORED `"0"`. `remote` genuinely handles both tokens.
 * - Sort keys removed: the route accepts no `sort` param today.
 *
 * MIGRATED in task 10.1. Two divergences blocked Phase 10 and BOTH are now
 * reproduced rather than "fixed", because either fix would change results:
 *  1. `status` goes through `toCardStatus`, a COERCION that maps legacy and
 *     alias spellings onto a `CardStatus` and falls back to `DESPACHADA` for
 *     anything unknown. A bare enum whitelist would reject exactly the inputs
 *     that coercion exists to accept, so the filter declares `coerce` and the
 *     whitelist only guards against a coercer returning something invalid.
 *  2. `from`/`to` use date-fns `parseISO`, so `to` is applied as
 *     `lte: <local midnight>` and EXCLUDES its own day. `boundaries: "instant"`
 *     reproduces that verbatim; `utcDay`/`localDay` would silently widen it.
 *
 * DECLARED behaviour change (one, deliberate): `origin` is validated. It used to
 * reach Prisma raw, so an unknown value produced a 500; it now produces a 400
 * through `ListQueryValidationError`. The accepted values are exactly the two in
 * `DispatchOrigin`, which is also exactly what this route's POST schema accepts.
 */
export const tarjetasListQuery = defineListQuery<Prisma.CardWhereInput>({
  key: "tarjetas",
  searchFields: ["tc", "requestNumber", "externalReference", "customer.cedula", "customer.nombre"],
  filters: [
    {
      kind: "enum",
      param: "productType",
      field: "productType",
      values: Object.values(CardProductType),
    },
    {
      kind: "enumList",
      param: "status",
      field: "status",
      values: Object.values(CardStatus),
      coerce: (raw) => toCardStatus(raw),
    },
    { kind: "stringList", param: "provincia", field: "provincia" },
    { kind: "stringList", param: "zona", field: "zona" },
    { kind: "enum", param: "origin", field: "dispatchOrigin", values: Object.values(DispatchOrigin) },
    { kind: "boolean", param: "urgent", field: "urgent", truthyOnly: true },
    { kind: "boolean", param: "remote", field: "isRemote" },
    { kind: "dateRange", field: "dispatchDate", fromParam: "from", toParam: "to", boundaries: "instant" },
  ],
  sort: {
    keys: {},
    fallbackOrderBy: [{ updatedAt: "desc" }],
  },
  pagination: { defaultPageSize: 25, maxPageSize: 200 },
});
