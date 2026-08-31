import { CardStatus, type Prisma } from "@prisma/client";
import { defineListQuery } from "../compile";

/**
 * Closed statuses that are excluded from SLA vencidas (both credit and debit).
 * Active debit statuses are: DESPACHADA, EN_RUTA, NO_LOCALIZADO.
 */
export const SLA_CLOSED_STATUSES: readonly CardStatus[] = [
  // Terminal credit statuses
  CardStatus.ENTREGADA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.RETORNADA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
  // Terminal debit statuses (entregado y devoluciones)
  CardStatus.TD_ENTREGADO,
  CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  CardStatus.TD_NO_LE_INTERESA,
  CardStatus.TD_RETIRADA_EN_OFICINA,
  CardStatus.TD_SOLICITADA_POR_ERROR,
  CardStatus.TD_ZONA_FUERA_COBERTURA,
] as const;

/**
 * List-query descriptor for `app/api/sla-vencidas/route.ts`.
 * Default ordering `slaDueDate: asc, updatedAt: desc`.
 * Page size 50 default / 500 max; `allowUnpaginated: true` for legacy export compatibility.
 */
export const slaVencidasListQuery = defineListQuery<Prisma.CardWhereInput>({
  key: "sla-vencidas",
  searchFields: ["tc", "customer.cedula", "customer.nombre", "provincia", "zona"],
  filters: [
    { kind: "string", param: "messengerId", field: "currentMessengerId" },
    { kind: "string", param: "provincia", field: "provincia" },
    { kind: "string", param: "zona", field: "zona" },
    {
      kind: "enum",
      param: "status",
      field: "status",
      values: Object.values(CardStatus).filter((s) => !SLA_CLOSED_STATUSES.includes(s)),
      onInvalid: "drop",
    },
    {
      kind: "enum",
      param: "productType",
      field: "productType",
      values: ["CREDITO", "DEBITO"],
      onInvalid: "drop",
    },
  ],
  sort: {
    keys: {
      slaDueDate: "slaDueDate",
      updatedAt: "updatedAt",
      dispatchDate: "dispatchDate",
      provincia: "provincia",
    },
    fallbackOrderBy: [{ slaDueDate: "asc" }, { updatedAt: "desc" }],
  },
  pagination: { defaultPageSize: 50, maxPageSize: 500 },
  allowUnpaginated: true,
});
