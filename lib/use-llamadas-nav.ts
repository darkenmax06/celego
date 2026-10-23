"use client";

import { useCallback, useEffect, useState } from "react";
import {
  absoluteIndex,
  canExtend,
  extendNavContext,
  navTotal,
  readNavContext,
  writeNavContext,
  type LlamadasNavContext,
} from "@/lib/llamadas/nav-context";

const MAX_PAGE_HOPS = 3;

export type UseLlamadasNav = {
  /** 0-based position in the origin list, `-1` when the card is not part of it. */
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  originUrl: string | null;
  originLabel: string | null;
  /** Resolves the neighbouring card id, loading the adjacent page when needed. */
  resolveNeighbor: (direction: "prev" | "next") => Promise<string | null>;
};

/** Calls overhaul: prev/next across the list the user came from (see `lib/llamadas/nav-context.ts`). */
export function useLlamadasNav(cardId: string): UseLlamadasNav {
  const [context, setContext] = useState<LlamadasNavContext | null>(null);

  useEffect(() => {
    setContext(readNavContext());
  }, [cardId]);

  const localIndex = context ? context.ids.indexOf(cardId) : -1;
  const inList = Boolean(context) && localIndex >= 0;

  const resolveNeighbor = useCallback(
    async (direction: "prev" | "next") => {
      let current = context;
      if (!current) return null;
      for (let hop = 0; hop <= MAX_PAGE_HOPS; hop += 1) {
        const position = current.ids.indexOf(cardId);
        if (position < 0) return null;
        const neighbor = current.ids[direction === "next" ? position + 1 : position - 1];
        if (neighbor) {
          if (current !== context) {
            writeNavContext(current);
            setContext(current);
          }
          return neighbor;
        }
        const extended = await extendNavContext(current, direction);
        if (!extended) return null;
        current = extended;
      }
      return null;
    },
    [context, cardId],
  );

  return {
    index: inList && context ? absoluteIndex(context, cardId) : -1,
    total: inList && context ? navTotal(context) : 0,
    hasPrev: inList && context ? localIndex > 0 || canExtend(context, "prev") : false,
    hasNext: inList && context ? localIndex < context.ids.length - 1 || canExtend(context, "next") : false,
    originUrl: context?.originUrl ?? null,
    originLabel: context?.originLabel ?? null,
    resolveNeighbor,
  };
}
