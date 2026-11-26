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
