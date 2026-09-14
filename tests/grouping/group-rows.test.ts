import { describe, expect, it } from "vitest";
import {
  CARD_GROUP_NONE_LABEL,
  CARD_GROUP_NONE_TOKEN,
  bucketCountLabel,
  cardGroupBuckets,
  groupRows,
  singleBucket,
  toGroupNameMap,
} from "@/lib/grouping";

type Row = { id: string; provincia: string; groupIds?: string[] };

const nameById = toGroupNameMap([
  { id: "g1", name: "Alfa" },
  { id: "g2", name: "Beta" },
]);

describe("groupRows", () => {
  it("puts a row in exactly one bucket for a scalar key function", () => {
    const rows: Row[] = [
      { id: "a", provincia: "AZUA" },
      { id: "b", provincia: "SANTIAGO" },
      { id: "c", provincia: "AZUA" },
    ];

    const buckets = groupRows(rows, singleBucket((row) => ({ key: row.provincia, label: row.provincia })));

    expect(buckets.map((b) => b.groupKey)).toEqual(["AZUA", "SANTIAGO"]);
    expect(buckets[0].items.map((r) => r.id)).toEqual(["a", "c"]);
    expect(buckets[1].items.map((r) => r.id)).toEqual(["b"]);
    expect(buckets.reduce((sum, b) => sum + b.items.length, 0)).toBe(rows.length);
  });

  it("fans one row out into every bucket its resolver returns", () => {
    const rows: Row[] = [{ id: "a", groupIds: ["g1", "g2"], provincia: "AZUA" }];

    const buckets = groupRows(rows, (row) => cardGroupBuckets(row.groupIds, nameById));

    expect(buckets.map((b) => b.groupKey)).toEqual(["g1", "g2"]);
    expect(buckets[0].items).toEqual(rows);
    expect(buckets[1].items).toEqual(rows);
  });

  it("never pushes the same row twice into one bucket", () => {
    const rows: Row[] = [{ id: "a", provincia: "AZUA" }];

    const buckets = groupRows(rows, () => [
      { key: "dup", label: "Dup" },
      { key: "dup", label: "Dup" },
    ]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].items).toHaveLength(1);
  });

  it("falls back to a General bucket when a resolver returns nothing", () => {
    const buckets = groupRows([{ id: "a", provincia: "AZUA" }], () => []);
    expect(buckets.map((b) => b.groupKey)).toEqual(["ALL"]);
  });
});

describe("cardGroupBuckets", () => {
  it("returns the Sin grupo bucket for a card with no memberships", () => {
    expect(cardGroupBuckets([], nameById)).toEqual([
      { key: CARD_GROUP_NONE_TOKEN, label: CARD_GROUP_NONE_LABEL },
    ]);
    expect(cardGroupBuckets(undefined, nameById)).toEqual([
      { key: CARD_GROUP_NONE_TOKEN, label: CARD_GROUP_NONE_LABEL },
    ]);
  });

  it("labels buckets from the group name map and falls back to the id", () => {
    expect(cardGroupBuckets(["g2", "unknown"], nameById)).toEqual([
      { key: "g2", label: "Beta" },
      { key: "unknown", label: "unknown" },
    ]);
  });
});

describe("bucketCountLabel", () => {
  it("states only what the page shows when no server total exists", () => {
    expect(bucketCountLabel(1, null)).toBe("1 tarjeta");
    expect(bucketCountLabel(4, undefined)).toBe("4 tarjetas");
  });

  it("renders both numbers when a server total exists", () => {
    expect(bucketCountLabel(4, 37)).toBe("37 tarjetas · 4 en esta página");
    expect(bucketCountLabel(1, 1)).toBe("1 tarjeta · 1 en esta página");
  });
});
