import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ListQueryValidationError } from "@/lib/list-query";
import { compileTarjetasListQuery } from "@/lib/list-query/tarjetas-where";
import { prisma } from "@/lib/prisma";
import {
  FILTER_SELECTION_TOO_LARGE_MESSAGE,
  MAX_FILTER_SELECTION,
  type CardFilterSelection,
} from "./card-filter-selection-schema";

export * from "./card-filter-selection-schema";

/**
 * Server-side resolution of a "select all matching" bulk selection.
 *
 * The query is compiled with `compileTarjetasListQuery` — the exact builder
 * `GET /api/tarjetas` uses — so the bulk action targets the same set the user
 * sees in the list. Pagination params never narrow the set.
 */
const PAGINATION_PARAMS = ["page", "pageSize"];

export const GROUP_MEMBER_INSERT_BATCH_SIZE = 1000;

export class CardFilterSelectionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CardFilterSelectionError";
  }
}

export async function compileCardFilterSelection(
  selection: CardFilterSelection,
): Promise<{ where: Prisma.CardWhereInput; orderBy: Prisma.CardOrderByWithRelationInput[] }> {
  const params = new URLSearchParams(selection.query);
  for (const param of PAGINATION_PARAMS) params.delete(param);
  try {
    const { query, where } = await compileTarjetasListQuery(params);
    return { where, orderBy: query.orderBy as Prisma.CardOrderByWithRelationInput[] };
  } catch (error) {
    if (error instanceof ListQueryValidationError) throw new CardFilterSelectionError(error.message, 400);
    throw error;
  }
}

/** Throws when a resolved selection exceeds `max` rows. */
export function assertWithinFilterSelectionCap(count: number, max = MAX_FILTER_SELECTION): void {
  if (count > max) throw new CardFilterSelectionError(FILTER_SELECTION_TOO_LARGE_MESSAGE, 400);
}

/** Ids of every card matching the selection, in list order. Throws above `max`. */
export async function resolveCardFilterSelectionIds(
  selection: CardFilterSelection,
  max = MAX_FILTER_SELECTION,
): Promise<string[]> {
  const { where, orderBy } = await compileCardFilterSelection(selection);
  const rows = await prisma.card.findMany({ where, orderBy, select: { id: true }, take: max + 1 });
  assertWithinFilterSelectionCap(rows.length, max);
  return rows.map((row) => row.id);
}

/** Adds cards to a group in `createMany` batches; returns how many were new members. */
export async function addCardsToGroupInBatches(
  groupId: string,
  cardIds: readonly string[],
  addedById: string,
  batchSize = GROUP_MEMBER_INSERT_BATCH_SIZE,
): Promise<number> {
  let added = 0;
  for (let start = 0; start < cardIds.length; start += batchSize) {
    const result = await prisma.cardGroupMember.createMany({
      data: cardIds.slice(start, start + batchSize).map((cardId) => ({ groupId, cardId, addedById })),
      skipDuplicates: true,
    });
    added += result.count;
  }
  return added;
}

export function cardFilterSelectionErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof CardFilterSelectionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
