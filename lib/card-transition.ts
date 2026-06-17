import { CardStatus, Prisma } from "@prisma/client";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";

export const RETURN_REASON_REQUIRED = "RETURN_REASON_REQUIRED";

type CardTransitionSource = {
  id: string;
  status: CardStatus;
  returnReason: string | null;
  digitalDeliveryCycle: number;
};

type ApplyCardTransitionInput = {
  tx: Prisma.TransactionClient;
  card: CardTransitionSource;
  nextStatus: CardStatus;
  byUserId?: string;
  note?: string | null;
  returnReason?: string | null;
  data?: Omit<
    Prisma.CardUncheckedUpdateInput,
    "status" | "returnReason" | "digitalDeliveryCycle" | "bizcochito" | "bizcochitoAt"
  >;
  alwaysLog?: boolean;
};

export function digitalCycleUpdate(
  card: Pick<CardTransitionSource, "status" | "digitalDeliveryCycle">,
  nextStatus: CardStatus,
) {
  if (card.status !== CardStatus.ENTREGA_DIGITAL && nextStatus === CardStatus.ENTREGA_DIGITAL) {
    return {
      digitalDeliveryCycle: Math.max(0, card.digitalDeliveryCycle) + 1,
      bizcochito: false,
      bizcochitoAt: null,
    };
  }

  return {};
}

export function initialDigitalCycle(status: CardStatus) {
  return status === CardStatus.ENTREGA_DIGITAL
    ? { digitalDeliveryCycle: 1, bizcochito: false, bizcochitoAt: null }
    : {};
}

export async function applyCardTransition({
  tx,
  card,
  nextStatus,
  byUserId,
  note,
  returnReason,
  data,
  alwaysLog = false,
}: ApplyCardTransitionInput) {
  const requiresReturnReason =
    nextStatus === CardStatus.RETORNADA || nextStatus === CardStatus.DEVUELTA_TIENDA;
  const nextReturnReason =
    returnReason !== undefined
      ? returnReason
      : requiresReturnReason
        ? card.returnReason
        : null;

  if (requiresReturnReason && !nextReturnReason?.trim()) {
    throw new Error(RETURN_REASON_REQUIRED);
  }

  const updated = await tx.card.update({
    where: { id: card.id },
    data: {
      ...data,
      status: nextStatus,
      returnReason: nextReturnReason,
      ...digitalCycleUpdate(card, nextStatus),
    },
  });

  await clearUrgencyOnCardClosure({
    tx,
    cardId: card.id,
    nextStatus,
    byUserId,
  });

  if (alwaysLog || card.status !== nextStatus || note) {
    await tx.cardStatusLog.create({
      data: {
        cardId: card.id,
        fromStatus: card.status,
        toStatus: nextStatus,
        note: note?.trim() || null,
        byUserId,
      },
    });
  }

  return updated;
}
