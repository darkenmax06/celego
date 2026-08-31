/**
 * Frozen description of the nine paginated list routes as they behave TODAY,
 * before any `lib/list-query` migration.
 *
 * Every value here was transcribed from a direct read of the route source and is
 * re-anchored against that source by `pagination-contract.test.ts`, so a route
 * that drifts away from this table fails the suite instead of silently changing
 * its public envelope.
 */

export type ListRouteContract = {
  /** Stable resource key; will become the `lib/list-query` registry key. */
  readonly key: string;
  /** Repo-relative path to the route handler. */
  readonly file: string;
  /** Envelope property holding the page of rows. */
  readonly listKey: string;
  /** Every envelope property, in the EXACT order the route emits it. */
  readonly envelopeKeys: readonly string[];
  readonly defaultPageSize: number;
  readonly maxPageSize: number;
  /** True only for a route that may answer without a `pagination` key at all. */
  readonly allowUnpaginated: boolean;
  /**
   * True when the route hoists the raw params into `pageParam`/`pageSizeParam`
   * before parsing them. Only the dual-mode route needs this, because it must
   * branch on their ABSENCE before any clamping happens.
   */
  readonly hoistsRawParams: boolean;
  /**
   * True once the route reads its page params through `lib/list-query` instead
   * of its own inline literals. The default/max VALUES above never change; only
   * where they are written does. `false` records a route deliberately left on
   * the legacy form, with the reason in its descriptor.
   */
  readonly migrated: boolean;
  /** Symbol name of the descriptor a migrated route compiles. */
  readonly descriptorSymbol: string;
  /**
   * True for a route that still slices its page IN MEMORY after the query,
   * because it merges more than one source and no single Prisma `skip`/`take`
   * is equivalent. Such a route takes only `page`/`pageSize` from its
   * descriptor; migrating its slice away would change which rows are returned.
   */
  readonly mergePaginatesInMemory: boolean;
};

export const LIST_ROUTE_CONTRACTS: readonly ListRouteContract[] = [
  {
    key: "tarjetas",
    file: "app/api/tarjetas/route.ts",
    listKey: "cards",
    envelopeKeys: ["cards", "pagination"],
    defaultPageSize: 25,
    maxPageSize: 200,
    allowUnpaginated: false,
    hoistsRawParams: false,
    migrated: true,
    descriptorSymbol: "tarjetasListQuery",
    mergePaginatesInMemory: false,
  },
  {
    key: "rutas",
    file: "app/api/rutas/route.ts",
    listKey: "routes",
    envelopeKeys: ["routes", "pagination"],
    defaultPageSize: 20,
    maxPageSize: 100,
    allowUnpaginated: false,
    hoistsRawParams: false,
    migrated: true,
    descriptorSymbol: "rutasListQuery",
    mergePaginatesInMemory: false,
  },
  {
    key: "mensajeros",
    file: "app/api/mensajeros/route.ts",
    listKey: "messengers",
    envelopeKeys: ["messengers", "pagination"],
    defaultPageSize: 25,
    maxPageSize: 100,
    allowUnpaginated: true,
    hoistsRawParams: true,
    migrated: true,
    descriptorSymbol: "mensajerosListQuery",
    mergePaginatesInMemory: false,
  },
  {
    key: "redacciones",
    file: "app/api/redacciones/route.ts",
    listKey: "redacciones",
    envelopeKeys: ["redacciones", "pagination"],
    defaultPageSize: 20,
    maxPageSize: 100,
    allowUnpaginated: false,
    hoistsRawParams: false,
    migrated: true,
    descriptorSymbol: "redaccionesListQuery",
    mergePaginatesInMemory: false,
  },
  {
    key: "lotes",
    file: "app/api/lotes/route.ts",
    listKey: "lots",
    envelopeKeys: ["lots", "pagination"],
    defaultPageSize: 20,
    maxPageSize: 100,
    allowUnpaginated: false,
    hoistsRawParams: false,
    migrated: true,
    descriptorSymbol: "lotesListQuery",
    mergePaginatesInMemory: false,
  },
  {
    key: "config-usuarios",
    file: "app/api/config/usuarios/route.ts",
    listKey: "users",
    envelopeKeys: ["users", "currentUserId", "pagination"],
    defaultPageSize: 20,
    maxPageSize: 100,
    allowUnpaginated: false,
    hoistsRawParams: false,
    migrated: true,
    descriptorSymbol: "configUsuariosListQuery",
    mergePaginatesInMemory: false,
  },
  {
    key: "actividad",
    file: "app/api/config/usuarios/[id]/actividad/route.ts",
    listKey: "events",
    envelopeKeys: ["events", "pagination"],
    defaultPageSize: 25,
    maxPageSize: 100,
    allowUnpaginated: false,
    hoistsRawParams: false,
    migrated: true,
    descriptorSymbol: "actividadListQuery",
    mergePaginatesInMemory: false,
  },
  {
    key: "operativo-contacto",
    file: "app/api/operativo/contacto/route.ts",
    listKey: "cards",
    envelopeKeys: ["tab", "cards", "pagination"],
    defaultPageSize: 25,
    maxPageSize: 100,
    allowUnpaginated: false,
    hoistsRawParams: false,
    migrated: true,
    descriptorSymbol: "operativoContactoListQuery",
    mergePaginatesInMemory: true,
  },
  {
    key: "bizcochitos",
    file: "app/api/status-digitales/bizcochitos/route.ts",
    listKey: "batches",
    envelopeKeys: ["pendingCount", "latest", "batches", "pagination"],
    defaultPageSize: 15,
    maxPageSize: 50,
    allowUnpaginated: false,
    hoistsRawParams: false,
    migrated: true,
    descriptorSymbol: "bizcochitosListQuery",
    mergePaginatesInMemory: false,
  },
] as const;

export function getListRouteContract(key: string): ListRouteContract {
  const contract = LIST_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
  if (!contract) throw new Error(`Unknown list route contract: ${key}`);
  return contract;
}
