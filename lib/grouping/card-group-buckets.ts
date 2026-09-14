/**
 * SDD card-groups — Stage C, Tasks C1/C3.
 *
 * The "Grupo" group-by, declared once for all three list screens: bucket keys
 * and labels, the "Sin grupo" bucket, and the bucket-header copy that has to
 * stay honest when a server total is present and when it is not.
 */
import { CARD_GROUP_NONE_TOKEN } from "@/lib/list-query/card-group-where";
import type { GroupBucketKey } from "./group-rows";

/** The group-by field the screens send and the group-by route understands. */
export const CARD_GROUP_BY_FIELD = "grupo";

export const CARD_GROUP_NONE_LABEL = "Sin grupo";

export { CARD_GROUP_NONE_TOKEN };

/**
 * Every bucket a card belongs to: one per group membership, or the single
 * "Sin grupo" bucket when it has none. Rows with no `groupIds` at all (the
 * `/operativo` `urgentes` tab synthesizes such rows) land in "Sin grupo"
 * rather than vanishing.
 */
export function cardGroupBuckets(
  groupIds: readonly string[] | undefined | null,
  groupNameById: ReadonlyMap<string, string>,
): GroupBucketKey[] {
  const ids = groupIds ?? [];
  if (!ids.length) {
    return [{ key: CARD_GROUP_NONE_TOKEN, label: CARD_GROUP_NONE_LABEL }];
  }

  const buckets = ids.map((id) => ({ key: id, label: groupNameById.get(id) ?? id }));
  buckets.sort((a, b) => a.label.localeCompare(b.label, "es"));
  return buckets;
}

/** Builds the id → name map the bucket labels resolve against. */
export function toGroupNameMap(
  groups: readonly { id: string; name: string }[],
): ReadonlyMap<string, string> {
  return new Map(groups.map((group) => [group.id, group.name]));
}

/**
 * Bucket-header count copy.
 *
 * With no server total, only the number of rows this page is showing is known,
 * so only that is stated. With a server total, both numbers are rendered: the
 * group's real total and how much of it this page holds. Never a number nobody
 * computed.
 */
export function bucketCountLabel(shown: number, total: number | null | undefined): string {
  if (total === null || total === undefined) {
    return `${shown} ${shown === 1 ? "tarjeta" : "tarjetas"}`;
  }
  return `${total} ${total === 1 ? "tarjeta" : "tarjetas"} · ${shown} en esta página`;
}

/** One-line note explaining why the buckets can sum past the page total. */
export const CARD_GROUP_FANOUT_NOTE =
  "Una tarjeta que pertenece a varios grupos aparece en cada uno de ellos, por lo que la suma de los grupos puede superar el total mostrado.";
