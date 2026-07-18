import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type CardAdditionalClient = Pick<Prisma.TransactionClient, "card">;

export type AdditionalGroupInput = {
  customerCedula: string;
  dispatchDate: Date | null | undefined;
};

export type CardForAdditionalDetection = {
  id: string;
  createdAt: Date;
  dispatchDate: Date | null;
  isAdditional?: boolean;
  additionalIndex?: number;
  customer: {
    cedula: string;
  };
};

export type AdditionalAssignment = {
  id: string;
  isAdditional: boolean;
  additionalIndex: number;
};

function normalizeCedula(cedula: string) {
  const digits = cedula.replace(/\D/g, "");
  return digits || cedula.trim().toUpperCase();
}

export function cardDispatchDateKey(value: Date | null | undefined) {
  if (!value) return "";
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcDayRange(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  return { start, end };
}

function groupKey(customerCedula: string, dispatchDate: Date | null | undefined) {
  const dateKey = cardDispatchDateKey(dispatchDate);
  if (!dateKey) return "";
  return `${normalizeCedula(customerCedula)}|${dateKey}`;
}

export function computeAdditionalAssignments<T extends CardForAdditionalDetection>(
  cards: T[],
) {
  const grouped = new Map<string, T[]>();
  const assignments = new Map<string, AdditionalAssignment>();

  for (const card of cards) {
    const key = groupKey(card.customer.cedula, card.dispatchDate);
    if (!key) {
      assignments.set(card.id, {
        id: card.id,
        isAdditional: false,
        additionalIndex: 0,
      });
      continue;
    }

    const bucket = grouped.get(key) ?? [];
    bucket.push(card);
    grouped.set(key, bucket);
  }

  for (const bucket of grouped.values()) {
    bucket.sort((left, right) => {
      const createdDifference = left.createdAt.getTime() - right.createdAt.getTime();
      if (createdDifference !== 0) return createdDifference;
      return left.id.localeCompare(right.id);
    });

    bucket.forEach((card, index) => {
      assignments.set(card.id, {
        id: card.id,
        isAdditional: index > 0,
        additionalIndex: index,
      });
    });
  }

  return Array.from(assignments.values());
}

function uniqueGroups(groups: AdditionalGroupInput[]) {
  const seen = new Set<string>();
  const unique: Array<{
    customerCedula: string;
    normalizedCedula: string;
    dispatchDateKey: string;
  }> = [];

  for (const group of groups) {
    const normalizedCedula = normalizeCedula(group.customerCedula);
    const dispatchDateKey = cardDispatchDateKey(group.dispatchDate);
    if (!normalizedCedula || !dispatchDateKey) continue;

    const key = `${normalizedCedula}|${dispatchDateKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      customerCedula: group.customerCedula,
      normalizedCedula,
      dispatchDateKey,
    });
  }

  return unique;
}

async function applyAssignments(
  client: CardAdditionalClient,
  cards: CardForAdditionalDetection[],
) {
  const assignments = computeAdditionalAssignments(cards);
  let updated = 0;

  for (const assignment of assignments) {
    const card = cards.find((item) => item.id === assignment.id);
    if (!card) continue;
    if (
      card.isAdditional === assignment.isAdditional &&
      card.additionalIndex === assignment.additionalIndex
    ) {
      continue;
    }

    const result = await client.card.updateMany({
      where: { id: assignment.id },
      data: {
        isAdditional: assignment.isAdditional,
        additionalIndex: assignment.additionalIndex,
      },
    });
    updated += result.count;
  }

  return {
    updated,
    total: assignments.length,
    additional: assignments.filter((assignment) => assignment.isAdditional).length,
  };
}

export async function recalculateAdditionalCardsForGroups(
  groups: AdditionalGroupInput[],
  client: CardAdditionalClient = prisma,
) {
  const unique = uniqueGroups(groups);
  let updated = 0;
  let total = 0;
  let additional = 0;

  for (const group of unique) {
    const { start, end } = utcDayRange(group.dispatchDateKey);
    const cards = await client.card.findMany({
      where: {
        customer: {
          cedula: group.customerCedula,
        },
        dispatchDate: {
          gte: start,
          lt: end,
        },
      },
      select: {
        id: true,
        createdAt: true,
        dispatchDate: true,
        isAdditional: true,
        additionalIndex: true,
        customer: {
          select: {
            cedula: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (!cards.length) continue;
    const result = await applyAssignments(client, cards);
    updated += result.updated;
    total += result.total;
    additional += result.additional;
  }

  return { groups: unique.length, total, additional, updated };
}

export async function recalculateAllCardAdditionals(
  client: CardAdditionalClient = prisma,
) {
  const cards = await client.card.findMany({
    select: {
      id: true,
      createdAt: true,
      dispatchDate: true,
      isAdditional: true,
      additionalIndex: true,
      customer: {
        select: {
          cedula: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return applyAssignments(client, cards);
}
