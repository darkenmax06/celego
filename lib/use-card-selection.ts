"use client";

import { useCallback, useMemo } from "react";
import { usePersistentState } from "@/lib/use-persistent-state";

/**
 * SDD card-groups — Work Unit E, Task 12.
 *
 * A bulk-selection set of card ids for `/tarjetas`, held ABOVE the list query
 * so it survives pagination and filter changes (product decision 1). Backed
 * by `usePersistentState<string[]>` — the SAME mechanism `selectedCardId`
 * (`tarjetas-client.tsx:272`) already uses — so it also survives a remount.
 *
 * Stored as `string[]`, never a `Set`: `usePersistentState` round-trips
 * through `JSON.stringify`/`JSON.parse`, which a `Set` cannot survive.
 * `idSet` is derived with `useMemo` for O(1) `isSelected` membership checks.
 */
export type UseCardSelection = {
  readonly ids: string[];
  readonly idSet: ReadonlySet<string>;
  readonly count: number;
  isSelected(cardId: string): boolean;
  toggle(cardId: string): void;
  selectMany(cardIds: string[]): void;
  clear(): void;
};

const STORAGE_KEY = "tarjetas:card-selection";

export function useCardSelection(): UseCardSelection {
  const [ids, setIds] = usePersistentState<string[]>(STORAGE_KEY, []);

  const idSet = useMemo(() => new Set(ids), [ids]);

  const isSelected = useCallback((cardId: string) => idSet.has(cardId), [idSet]);

  const toggle = useCallback(
    (cardId: string) => {
      setIds((current) =>
        current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId],
      );
    },
    [setIds],
  );

  const selectMany = useCallback(
    (cardIds: string[]) => {
      setIds((current) => {
        const next = new Set(current);
        for (const id of cardIds) next.add(id);
        return [...next];
      });
    },
    [setIds],
  );

  const clear = useCallback(() => setIds([]), [setIds]);

  return { ids, idSet, count: ids.length, isSelected, toggle, selectMany, clear };
}
