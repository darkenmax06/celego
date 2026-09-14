import { compareDateGroupKeys, parseDateGroupToken } from "@/lib/card-date-fields";

/**
 * Nested client-side grouping for list views. The `groupBy` filter holds an
 * ordered, comma-separated list of level tokens (first = outermost level),
 * e.g. `status,fecha:dispatchDate:month`. A single legacy token is simply a
 * one-level list, so saved favorites keep working.
 */

export const GROUP_BY_SEPARATOR = ",";

/** Ordered, de-duplicated level tokens of a `groupBy` filter value. */
export function parseGroupByLevels(value: string | undefined | null): string[] {
  const levels: string[] = [];
  for (const raw of (value ?? "").split(GROUP_BY_SEPARATOR)) {
    const token = raw.trim();
    if (token && token !== "ALL" && !levels.includes(token)) levels.push(token);
  }
  return levels;
}

/** `undefined` when there is no level left, so callers can drop the filter key. */
export function serializeGroupByLevels(levels: readonly string[]): string | undefined {
  const clean = parseGroupByLevels(levels.join(GROUP_BY_SEPARATOR));
  return clean.length ? clean.join(GROUP_BY_SEPARATOR) : undefined;
}

/** Appends `token` as the innermost level, or removes it (inner levels shift up) when already selected. */
export function toggleGroupByLevel(value: string | undefined, token: string): string | undefined {
  const levels = parseGroupByLevels(value);
  return serializeGroupByLevels(
    levels.includes(token) ? levels.filter((level) => level !== token) : [...levels, token],
  );
}

export type GroupKey = { key: string; label: string };

export type GroupNode<T> = {
  /** Bucket key at this level. */
  key: string;
  label: string;
  /** Level token that produced this bucket. */
  token: string;
  /** 0 for the outermost level. */
  depth: number;
  /** Unique across the whole tree (includes every ancestor); use it for collapse state and React keys. */
  path: string;
  /** Number of rows under this node, across all nested levels. */
  count: number;
  /** Every row under this node, in input order. */
  rows: T[];
  /** Sub-groups of the next level; empty on the innermost level. */
  children: GroupNode<T>[];
};

export type GroupKeyComparator = (a: GroupKey, b: GroupKey) => number;

/** Unit separator: never part of a level token or an ordinary bucket key. */
const PATH_SEPARATOR = String.fromCharCode(31);

/** Default per-level order: date buckets chronologically ("Sin fecha" last), other levels keep first-seen order. */
export function defaultGroupComparator(token: string): GroupKeyComparator | undefined {
  return parseDateGroupToken(token) ? (a, b) => compareDateGroupKeys(a.key, b.key) : undefined;
}

/**
 * Buckets `rows` level by level in `levels` order. Returns `null` when there
 * is no level (the view renders flat). `getKey` maps a row to its bucket for
 * one level token.
 */
export function groupRowsNested<T>(
  rows: readonly T[],
  levels: readonly string[],
  getKey: (row: T, token: string) => GroupKey,
  compare: (token: string) => GroupKeyComparator | undefined = defaultGroupComparator,
): GroupNode<T>[] | null {
  if (!levels.length) return null;

  function build(items: readonly T[], depth: number, parentPath: string): GroupNode<T>[] {
    const token = levels[depth];
    const buckets = new Map<string, GroupNode<T>>();
    for (const row of items) {
      const { key, label } = getKey(row, token);
      let node = buckets.get(key);
      if (!node) {
        const segment = `${token}=${key}`;
        node = {
          key,
          label,
          token,
          depth,
          path: parentPath ? `${parentPath}${PATH_SEPARATOR}${segment}` : segment,
          count: 0,
          rows: [],
          children: [],
        };
        buckets.set(key, node);
      }
      node.rows.push(row);
      node.count += 1;
    }
    const nodes = [...buckets.values()];
    const comparator = compare(token);
    if (comparator) nodes.sort(comparator);
    if (depth + 1 < levels.length) {
      for (const node of nodes) node.children = build(node.rows, depth + 1, node.path);
    }
    return nodes;
  }

  return build(rows, 0, "");
}
