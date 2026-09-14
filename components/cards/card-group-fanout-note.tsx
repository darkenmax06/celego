"use client";

import { CARD_GROUP_FANOUT_NOTE } from "@/lib/grouping";

/**
 * SDD card-groups — Stage C, Task C3.
 *
 * One unobtrusive line, rendered only while grouping by "Grupo", that explains
 * why the buckets can sum past the total shown: a card in several groups is
 * listed in each of them.
 */
export type CardGroupFanoutNoteProps = {
  /**
   * Set on screens where no server total exists, so the bucket counts describe
   * only the current page and the copy has to say so instead of implying a
   * total nobody computed.
   */
  pageScopedCounts?: boolean;
};

export function CardGroupFanoutNote({ pageScopedCounts = false }: CardGroupFanoutNoteProps) {
  return (
    <p
      data-testid="card-group-fanout-note"
      className="text-xs text-slate-500"
    >
      {CARD_GROUP_FANOUT_NOTE}
      {pageScopedCounts ? " Los conteos por grupo corresponden solo a las tarjetas de esta página." : null}
    </p>
  );
}
