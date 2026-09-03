import { CardStatus, Prisma } from "@prisma/client";
import {
  classifyCardLifecycle,
  clearUrgencyOnCardClosure,
  parkUrgencyOnPendingReception,
} from "@/lib/urgent-alerts";
import { isTerminalCardStatus, nextTcGuardState } from "@/lib/dispatch-origin";

export const RETURN_REASON_REQUIRED = "RETURN_REASON_REQUIRED";

type CardTransitionSource = {
  id: string;
  tc: string;
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

/**
 * SDD contrato-tarjetas-pistoleo (design decision #2 / D-decisions in
 * observation #602-#604): `ENTREGA_DIGITAL_SIN_CONTRATO` must trigger the
 * same digital-delivery cycle increment as `ENTREGA_DIGITAL` on entry, so a
 * later `ENTREGA_DIGITAL_SIN_CONTRATO -> ENTREGA_DIGITAL` resolution does not
 * double-count. Membership-set comparison on BOTH sides of the transition
 * covers both directions with one check.
 */
export const DIGITAL_DELIVERY_STATUSES = new Set<CardStatus>([
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO,
]);

export function digitalCycleUpdate(
  card: Pick<CardTransitionSource, "status" | "digitalDeliveryCycle">,
  nextStatus: CardStatus,
) {
  if (!DIGITAL_DELIVERY_STATUSES.has(card.status) && DIGITAL_DELIVERY_STATUSES.has(nextStatus)) {
    return {
      digitalDeliveryCycle: Math.max(0, card.digitalDeliveryCycle) + 1,
      bizcochito: false,
      bizcochitoAt: null,
    };
  }

  return {};
}

export function initialDigitalCycle(status: CardStatus) {
  return DIGITAL_DELIVERY_STATUSES.has(status)
    ? { digitalDeliveryCycle: 1, bizcochito: false, bizcochitoAt: null }
    : {};
}

export async function syncTcGuardForTransition(
  tx: Prisma.TransactionClient,
  input: { tc: string; cardId: string; nextStatus: CardStatus },
) {
  if (!isTerminalCardStatus(input.nextStatus)) return;
  const guardState = nextTcGuardState(input.nextStatus, input.cardId);
  await tx.cardTcGuard.upsert({
    where: { tc: input.tc },
    update: guardState,
    create: { tc: input.tc, ...guardState },
  });
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

  await syncTcGuardForTransition(tx, { tc: card.tc, cardId: card.id, nextStatus });

  // SDD solicitudes-reclamaciones-urgentes (design D4): tri-state branch —
  // CLOSED resolves urgency history (unchanged), PENDING_RECEPTION parks it
  // (case stays open), ACTIVE does nothing.
  const lifecyclePhase = classifyCardLifecycle(nextStatus);
  if (lifecyclePhase === "CLOSED") {
    await clearUrgencyOnCardClosure({
      tx,
      cardId: card.id,
      nextStatus,
      byUserId,
    });
  } else if (lifecyclePhase === "PENDING_RECEPTION") {
    await parkUrgencyOnPendingReception({
      tx,
      cardId: card.id,
      nextStatus,
      byUserId,
    });
  }

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
