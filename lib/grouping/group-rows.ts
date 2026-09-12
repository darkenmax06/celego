/**
 * SDD card-groups — Stage C, Task C1.
 *
 * The one client-side grouping reducer for every list screen.
 *
 * `/tarjetas`, `/operativo` and `/sla-vencidas` each used to carry their own
 * near-identical copy of this loop, and every copy pushed a row into exactly
 * one bucket. That single-bucket shape was the structural blocker for the
 * "Grupo" group-by, where a card belonging to several groups must appear in
 * EVERY one of its buckets. Duplicating the fan-out three times is exactly the
 * pattern that has already produced defects on this surface, so the reducer
 * lives here once and the three screens only supply a key function.
 */

/** One bucket a row belongs to. */
export type GroupBucketKey = {
  readonly key: string;
  readonly label: string;
};

export type GroupBucket<T> = {
  groupKey: string;
  groupLabel: string;
  items: T[];
};

/** Returns every bucket a row belongs to. A scalar group-by returns one. */
export type GroupKeyResolver<T> = (row: T) => readonly GroupBucketKey[];

/** Bucket used when a resolver returns nothing at all for a row. */
const FALLBACK_BUCKET: GroupBucketKey = { key: "ALL", label: "General" };

/**
 * Fans every row out across all the buckets its resolver returns, preserving
 * both first-encounter bucket order and row order inside each bucket.
 *
 * A row is never pushed twice into the same bucket, so a duplicated key from a
 * resolver cannot inflate a single bucket's count.
 */
export function groupRows<T>(
  rows: readonly T[],
  resolve: GroupKeyResolver<T>,
): GroupBucket<T>[] {
  const buckets = new Map<string, GroupBucket<T>>();

  for (const row of rows) {
    const resolved = resolve(row);
    const keys = resolved.length ? resolved : [FALLBACK_BUCKET];
    const seen = new Set<string>();

    for (const { key, label } of keys) {
      if (seen.has(key)) continue;
      seen.add(key);

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { groupKey: key, groupLabel: label, items: [] };
        buckets.set(key, bucket);
      }
      bucket.items.push(row);
    }
  }

  return Array.from(buckets.values());
}

/** Adapts a scalar key function (one bucket per row) to a `GroupKeyResolver`. */
export function singleBucket<T>(
  resolve: (row: T) => GroupBucketKey,
): GroupKeyResolver<T> {
  return (row) => [resolve(row)];
}
