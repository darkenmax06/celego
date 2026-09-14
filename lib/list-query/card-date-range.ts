import type { Prisma } from "@prisma/client";
import { compileSelectableDateRange } from "./compile";
import type { ListQueryParams, SelectableDateRangeFilter } from "./types";
import {
  LEGACY_DATE_FIELD_PARAM,
  LEGACY_DATE_FROM_PARAM,
  LEGACY_DATE_TO_PARAM,
  LEGACY_DEFAULT_DATE_FIELD,
} from "../date-range-params";

/**
 * The card date filter, declared exactly once (same pattern as
 * `CARD_GROUP_FILTER`).
 *
 * `/tarjetas` and `/sla-vencidas` spread it into their descriptors;
 * `/operativo`, `/contratos-pendientes` and the SLA exports build their `where`
 * by hand and call `compileCardDateRangeWhere` instead, so every card view
 * accepts the same `date.<field>.from|to` params and whitelist.
 *
 * Only real `DateTime` columns of `Card` are whitelisted; the operativo
 * delivery preference lives in JSON metadata and is not filterable here.
 */
export const CARD_DATE_RANGE_FIELDS = {
  dispatchDate: "dispatchDate",
  slaDueDate: "slaDueDate",
  reassignedAt: "reassignedAt",
  bizcochitoAt: "bizcochitoAt",
  contractImageAt: "contractImageAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const satisfies Record<string, keyof Prisma.CardWhereInput>;

export const CARD_DATE_RANGE_FILTER: SelectableDateRangeFilter<Prisma.CardWhereInput> = {
  kind: "selectableDateRange",
  fields: CARD_DATE_RANGE_FIELDS,
  legacy: {
    fieldParam: LEGACY_DATE_FIELD_PARAM,
    fromParam: LEGACY_DATE_FROM_PARAM,
    toParam: LEGACY_DATE_TO_PARAM,
    defaultField: LEGACY_DEFAULT_DATE_FIELD,
  },
  boundaries: "localDay",
};

/**
 * Card date constraints for hand-built `where`s, one conjunct per active field.
 * Throws `ListQueryValidationError` for a non-whitelisted field.
 */
export function compileCardDateRangeWhere(params: ListQueryParams): {
  clauses: Prisma.CardWhereInput[];
  impossible: boolean;
} {
  const { clauses, impossible } = compileSelectableDateRange(CARD_DATE_RANGE_FILTER, params);
  return { clauses: clauses as Prisma.CardWhereInput[], impossible };
}
