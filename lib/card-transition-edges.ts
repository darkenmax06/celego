/**
 * Pure derivation of the card status edges that were ACTUALLY observed in
 * production, read from `CardStatusLog`.
 *
 * The transition graph for `unified-server-side-filtering` must be empirical:
 * rejecting a legitimate existing flow is a defect. This module is the read-only
 * evidence collector behind `scripts/derive-card-transitions.ts`. It never
 * writes, and it never invents an edge.
 */

/** A `CardStatusLog.fromStatus` is nullable: null marks a genesis (creation) edge. */
export type ObservedTransitionRow = {
  fromStatus: string | null;
  toStatus: string;
  _count: { _all: number };
};

export type ObservedTransitionPair = {
  from: string | null;
  to: string;
  count: number;
};

export type ObservedTransitionReport = {
  pairs: ObservedTransitionPair[];
  distinctPairs: number;
  totalObservations: number;
};

/** Minimal read-only surface. Deliberately exposes no mutating method. */
export type CardStatusLogReader = {
  cardStatusLog: {
    groupBy: (args: {
      by: ["fromStatus", "toStatus"];
      _count: { _all: true };
    }) => Promise<unknown>;
  };
};

const GENESIS_SORT_KEY = "";

function sortKey(value: string | null): string {
  // Genesis edges sort first so a reader sees where cards enter the graph.
  return value === null ? GENESIS_SORT_KEY : value;
}

/**
 * Collapses rows to distinct `(from, to)` pairs, summing observations, ordered
 * by `from` then `to`. Counts are preserved so a rare real edge (count 1) stays
 * visible and is not mistaken for noise.
 */
export function summarizeCardTransitionPairs(
  rows: readonly ObservedTransitionRow[],
): ObservedTransitionPair[] {
  const totals = new Map<string, ObservedTransitionPair>();

  for (const row of rows) {
    // "|" cannot occur in a CardStatus value, so the composite key is collision-free.
    const key = `${row.fromStatus ?? ""}|${row.toStatus}`;
    const existing = totals.get(key);
    if (existing) {
      existing.count += row._count._all;
      continue;
    }
    totals.set(key, { from: row.fromStatus, to: row.toStatus, count: row._count._all });
  }

  return [...totals.values()].sort((left, right) => {
    const byFrom = sortKey(left.from).localeCompare(sortKey(right.from));
    if (byFrom !== 0) return byFrom;
    return left.to.localeCompare(right.to);
  });
}

/** Runs the single read-only `groupBy` and summarizes it. Performs no writes. */
export async function deriveCardTransitionPairs(
  client: CardStatusLogReader,
): Promise<ObservedTransitionReport> {
  const rows = (await client.cardStatusLog.groupBy({
    by: ["fromStatus", "toStatus"],
    _count: { _all: true },
  })) as ObservedTransitionRow[];

  const pairs = summarizeCardTransitionPairs(rows);

  return {
    pairs,
    distinctPairs: pairs.length,
    totalObservations: pairs.reduce((sum, pair) => sum + pair.count, 0),
  };
}

/**
 * Renders a paste-ready report: a human-readable table first, then the exact
 * JSON payload to hand back for the transition-graph gate.
 */
export function formatCardTransitionPairs(report: ObservedTransitionReport): string {
  const label = (pair: ObservedTransitionPair) => `${pair.from ?? "null"} -> ${pair.to}`;
  const width = report.pairs.reduce((max, pair) => Math.max(max, label(pair).length), 0);

  const table = report.pairs.map((pair) => `# ${label(pair).padEnd(width)}  ${pair.count}`);

  return [
    "# Observed CardStatusLog transitions (read-only derivation).",
    `# distinct pairs: ${report.distinctPairs} | observations: ${report.totalObservations}`,
    "#",
    ...table,
    "",
    JSON.stringify(report, null, 2),
    "",
  ].join("\n");
}
