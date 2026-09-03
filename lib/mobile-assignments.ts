import { CardStatus } from "@prisma/client";
import { type MobileAssignmentCard } from "@/packages/contracts/src";
import { createCedulaVerificationToken } from "./mobile-route-package";

type RouteItemForAssignment = {
  id: string;
  routeId: string;
  sequence: number;
  route: {
    id: string;
    fecha: Date;
    createdAt: Date;
    messengerId: string;
  };
};

export type CardForMobileAssignment = {
  id: string;
  externalReference: string | null;
  status: CardStatus;
  provincia: string;
  zona: string;
  updatedAt: Date;
  customer: {
    cedula: string;
    nombre: string;
    direccionRaw: string | null;
  };
  routeItems: RouteItemForAssignment[];
};

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function selectLatestRouteItem(routeItems: RouteItemForAssignment[]) {
  return [...routeItems].sort((a, b) => {
    const dateDiff = b.route.fecha.getTime() - a.route.fecha.getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.route.createdAt.getTime() - a.route.createdAt.getTime();
  })[0];
}

export function serializeMobileAssignmentCard(
  card: CardForMobileAssignment,
): MobileAssignmentCard {
  const routeItem = selectLatestRouteItem(card.routeItems);

  return {
    cardId: card.id,
    routeId: routeItem?.routeId,
    routeItemId: routeItem?.id,
    sequence: routeItem?.sequence,
    recipientName: card.customer.nombre,
    addressLine: normalizeOptionalText(card.customer.direccionRaw),
    province: normalizeOptionalText(card.provincia),
    zone: normalizeOptionalText(card.zona),
    reference: normalizeOptionalText(card.externalReference),
    status: card.status as MobileAssignmentCard["status"],
    cedulaVerification: createCedulaVerificationToken(card.customer.cedula),
    updatedAt: card.updatedAt.toISOString(),
  };
}
