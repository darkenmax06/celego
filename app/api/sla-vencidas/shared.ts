import { CardProductType, CardStatus, Prisma } from "@prisma/client";
import { remainingBusinessDays } from "@/lib/sla";

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
};

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
