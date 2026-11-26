import { CardProductType, CardStatus, Prisma } from "@prisma/client";
import { remainingBusinessDays } from "@/lib/sla";
import { compile } from "@/lib/list-query";
import { cardPhoneSearchOr } from "@/lib/customer-phone-search";
import { slaVencidasListQuery, SLA_CLOSED_STATUSES } from "@/lib/list-query/descriptors/sla-vencidas";
import { ASIGNADO_PARAM, buildAsignadoWhere } from "@/lib/call-assignment";

/**
 * Compiles the SLA vencidas list query (descriptor + contacto/asignado/canal/urgent facets).
 * Shared by the list endpoint and its exports so both always return the same cards.
 * Throws `ListQueryValidationError` on invalid params.
 */
export async function compileSlaVencidasQuery(searchParams: URLSearchParams, userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compiled = compile(slaVencidasListQuery, searchParams, {
    andPrefix: [{ status: { notIn: [...SLA_CLOSED_STATUSES] }, slaDueDate: { lt: today } }],
    searchOr: await cardPhoneSearchOr(searchParams.get("q")),
  });

  const contactoEstado = searchParams.get("contactoEstado");
  const contactoConstraint: Prisma.CardWhereInput | undefined =
    contactoEstado === "CONTACTADA"
      ? { metadata: { path: ["operativo", "contactado"], equals: true } }
      : contactoEstado === "RETORNO_SOLICITADO"
        ? { metadata: { path: ["operativo", "solicitudRetorno"], equals: true } }
        : contactoEstado === "TRASLADO_SOLICITADO"
          ? { metadata: { path: ["operativo", "traslado", "provinciaDestino"], not: Prisma.AnyNull } }
          : contactoEstado === "NO_CONTACTADA"
            ? { NOT: { metadata: { path: ["operativo", "contactado"], equals: true } } }
            : undefined;

  // Calls overhaul: `asignado` (ME | SIN_ASIGNAR | userId).
  const asignadoConstraint = buildAsignadoWhere(searchParams.get(ASIGNADO_PARAM), userId);

  // Calls overhaul: `canalContacto` / `urgent` facets of the shared "llamadas" set.
  const canalContacto = searchParams.get("canalContacto");
  const canalConstraint: Prisma.CardWhereInput | undefined =
    canalContacto === "WHATSAPP" || canalContacto === "LLAMADA_DIRECTA"
      ? { metadata: { path: ["operativo", "canalContacto"], equals: canalContacto } }
      : undefined;
  const urgentConstraint: Prisma.CardWhereInput | undefined =
    searchParams.get("urgent") === "1" ? { urgent: true } : undefined;

  const extraConstraints = [contactoConstraint, asignadoConstraint, canalConstraint, urgentConstraint].filter(
    (clause): clause is Prisma.CardWhereInput => Boolean(clause),
  );
  const where: Prisma.CardWhereInput = extraConstraints.length
    ? { AND: [compiled.where, ...extraConstraints] }
    : compiled.where;
  return { ...compiled, where, today };
}

/** Derived call-management state stored under `metadata.operativo`. */
export function readSlaOperativo(metadata: Prisma.JsonValue) {
  const root = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  const op = (root.operativo && typeof root.operativo === "object" ? root.operativo : {}) as Record<string, unknown>;
  const contactado = Boolean(op.contactado);
  const solicitudRetorno = Boolean(op.solicitudRetorno);
  const traslado = op.traslado && typeof op.traslado === "object" ? (op.traslado as Record<string, unknown>) : null;
  const contactoEstado = solicitudRetorno
    ? "RETORNO_SOLICITADO"
    : traslado && Object.keys(traslado).length > 0
      ? "TRASLADO_SOLICITADO"
      : contactado
        ? "CONTACTADA"
        : "NO_CONTACTADA";
  return { op, contactado, solicitudRetorno, traslado, contactoEstado };
}

export const CLOSED_SLA_STATUSES: CardStatus[] = [
  CardStatus.ENTREGADA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.RETORNADA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
];

export type SlaTab = "UPCOMING" | "OVERDUE";

export type SlaFilters = {
  tab: SlaTab;
  productType?: CardProductType;
  messengerId?: string;
  provincia?: string;
  zona?: string;
  status?: CardStatus;
  q?: string;
  /** Customer phone match for `q`, from `cardPhoneSearchClause` (async, so callers resolve it). */
  phoneClause?: Prisma.CardWhereInput | null;
};

/**
 * `slaWhere` plus the card date range constraints (`date.<field>.from|to`)
 * compiled by `compileCardDateRangeWhere`, AND-combined.
 */
export function slaWhereWithDates(
  filters: SlaFilters,
  dateClauses: readonly Prisma.CardWhereInput[],
): Prisma.CardWhereInput {
  const base = slaWhere(filters);
  return dateClauses.length ? { AND: [base, ...dateClauses] } : base;
}

export function slaWhere(filters: SlaFilters): Prisma.CardWhereInput {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const q = filters.q?.trim();
  return {
    status: { notIn: CLOSED_SLA_STATUSES },
    slaDueDate: filters.tab === "OVERDUE" ? { lt: today } : { gte: today },
    ...(filters.productType ? { productType: filters.productType } : {}),
    ...(filters.messengerId ? { currentMessengerId: filters.messengerId } : {}),
    ...(filters.provincia ? { provincia: filters.provincia } : {}),
    ...(filters.zona ? { zona: filters.zona } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(q
      ? {
          OR: [
            { tc: { contains: q, mode: "insensitive" } },
            { requestNumber: { contains: q, mode: "insensitive" } },
            { externalReference: { contains: q, mode: "insensitive" } },
            { customer: { cedula: { contains: q, mode: "insensitive" } } },
            { customer: { nombre: { contains: q, mode: "insensitive" } } },
            ...(filters.phoneClause ? [filters.phoneClause] : []),
          ],
        }
      : {}),
  };
}

export function serializeSlaCard(
  card: {
    id: string;
    tc: string | null;
    requestNumber: string | null;
    productType: CardProductType;
    status: CardStatus;
    slaDueDate: Date | null;
    dispatchDate: Date | null;
    provincia: string;
    zona: string;
    urgent: boolean;
    isAdditional: boolean;
    additionalIndex: number;
    customer: { nombre: string; cedula: string; direccionRaw: string | null; telefonosRaw: string | null };
    currentMessenger: { id: string; nombre: string } | null;
    lastAssignedMessenger?: { id: string; nombre: string } | null;
  },
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const remainingDays = card.slaDueDate ? remainingBusinessDays(today, card.slaDueDate) : null;
  const identifier = card.productType === CardProductType.DEBITO ? card.requestNumber ?? "" : card.tc ?? "";
  const messenger = card.currentMessenger ?? card.lastAssignedMessenger ?? null;
  return {
    id: card.id,
    productType: card.productType,
    identifier,
    tc: card.tc ?? "",
    requestNumber: card.requestNumber ?? "",
    status: card.status,
    slaDueDate: card.slaDueDate?.toISOString() ?? null,
    dispatchDate: card.dispatchDate?.toISOString() ?? null,
    provincia: card.provincia,
    zona: card.zona,
    urgent: card.urgent,
    tipoTarjeta: card.isAdditional ? "ADICIONAL" : "PRINCIPAL",
    adicional: card.isAdditional,
    adicionalNumero: card.additionalIndex,
    nombre: card.customer.nombre,
    cedula: card.customer.cedula,
    direccion: card.customer.direccionRaw ?? "",
    telefonos: card.customer.telefonosRaw ?? "",
    mensajero: messenger?.nombre ?? "",
    mensajeroId: messenger?.id ?? "",
    diasRestantes: remainingDays,
    diasVencidos: Math.abs(Math.min(0, remainingDays ?? 0)),
  };
}

export function isUpcomingWithinWarning(slaDueDate: Date | null, warningBusinessDays: number) {
  if (!slaDueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const remaining = remainingBusinessDays(today, slaDueDate);
  return remaining >= 0 && remaining <= warningBusinessDays;
}
