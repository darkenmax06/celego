import { z } from "zod";

/**
 * "Select all matching" (Odoo style) payload shared by the bulk card actions.
 *
 * Instead of a list of ids, the client sends the same query params it uses
 * for `GET /api/tarjetas`; the server resolves them with the list's own where
 * builder (`lib/cards/card-filter-selection.ts`), so the affected set is exactly
 * what the user sees and never a client-supplied id list.
 *
 * Client-safe: no server imports here.
 */
export const MAX_FILTER_SELECTION = 20_000;

export const FILTER_SELECTION_TOO_LARGE_MESSAGE = `La selección supera el máximo de ${MAX_FILTER_SELECTION.toLocaleString(
  "es-DO",
)} tarjetas. Ajusta los filtros para reducirla.`;

export const cardFilterSelectionSchema = z.object({
  mode: z.literal("filter"),
  query: z.record(z.string(), z.string()).default({}),
});

export type CardFilterSelection = z.infer<typeof cardFilterSelectionSchema>;

/** Client-side handle of an active "all matching" selection: the list query and its total. */
export type CardFilterSelectionTarget = {
  query: Record<string, string>;
  count: number;
};

export function toCardFilterSelection(target: CardFilterSelectionTarget): CardFilterSelection {
  return { mode: "filter", query: target.query };
}
