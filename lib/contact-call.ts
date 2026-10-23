import { CardProductType, CardStatus } from "@prisma/client";
import { isClosedCardStatus } from "@/lib/urgent-alerts";

// Pure constants / validators live in the client-safe module; re-exported so
// API routes keep importing from `@/lib/contact-call`.
export * from "@/lib/contact-call-shared";

export const RETURN_IN_PROGRESS_STATUSES = new Set<CardStatus>([
  CardStatus.EN_PROCESO_DE_RETORNO,
  CardStatus.TD_EN_PROCESO_DE_RETORNO,
]);

/**
 * Status a card moves to when an operator requests a return from a call:
 * credit -> EN_PROCESO_DE_RETORNO, debit -> TD_EN_PROCESO_DE_RETORNO.
 * Returns `null` when no transition must happen (card already closed /
 * delivered, or already in a return-in-progress status).
 */
export function resolveReturnStatus(
  productType: CardProductType,
  currentStatus: CardStatus,
): CardStatus | null {
  if (isClosedCardStatus(currentStatus)) return null;
  if (currentStatus === CardStatus.ENTREGA_SIN_CONTRATO) return null;
  if (RETURN_IN_PROGRESS_STATUSES.has(currentStatus)) return null;
  return productType === CardProductType.DEBITO
    ? CardStatus.TD_EN_PROCESO_DE_RETORNO
    : CardStatus.EN_PROCESO_DE_RETORNO;
}
