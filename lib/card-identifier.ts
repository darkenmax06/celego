import { CardProductType } from "@prisma/client";

type IdentifiableCard = {
  productType: CardProductType;
  tc: string | null;
  requestNumber: string | null;
};

export function getCardIdentifier(card: IdentifiableCard) {
  return card.productType === CardProductType.DEBITO
    ? card.requestNumber ?? ""
    : card.tc ?? "";
}

export function getCardIdentifierLabel(card: IdentifiableCard) {
  return card.productType === CardProductType.DEBITO
    ? "N\u00famero de solicitud"
    : "N\u00famero de tarjeta";
}
