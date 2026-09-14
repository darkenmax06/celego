import { describe, expect, it } from "vitest";
import {
  CARD_DATE_GROUP_OPTIONS,
  cardDateGroupOptions,
  dateGroupToken,
  getCardDateGroup,
  NO_DATE_GROUP_KEY,
  parseDateGroupToken,
  type CardDateSource,
} from "@/lib/card-date-fields";
import {
  groupRowsNested,
  parseGroupByLevels,
  serializeGroupByLevels,
  toggleGroupByLevel,
  type GroupNode,
} from "@/lib/grouping";

type Row = { id: string; status: string; dispatchDate: string | null };

function localIso(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0).toISOString();
}

function getKey(row: Row, token: string) {
  const date = parseDateGroupToken(token);
  if (date) return getCardDateGroup(row as CardDateSource, date.key, date.granularity);
  if (token === "status") return { key: row.status, label: row.status };
  return { key: "ALL", label: "General" };
}

function summarize<T extends { id: string }>(nodes: GroupNode<T>[]): unknown[] {
  return nodes.map((node) => ({
    key: node.key,
    count: node.count,
    ...(node.children.length ? { children: summarize(node.children) } : { ids: node.rows.map((row) => row.id) }),
  }));
}

describe("groupBy level tokens", () => {
  it("parses a legacy single token as one level", () => {
    expect(parseGroupByLevels("status")).toEqual(["status"]);
    expect(parseGroupByLevels("fecha:dispatchDate:day")).toEqual(["fecha:dispatchDate:day"]);
    expect(parseGroupByLevels(undefined)).toEqual([]);
    expect(parseGroupByLevels("")).toEqual([]);
  });

  it("keeps selection order, trims and drops duplicates", () => {
    expect(parseGroupByLevels(" status , fecha:dispatchDate:month,status,,")).toEqual([
      "status",
      "fecha:dispatchDate:month",
    ]);
    expect(serializeGroupByLevels(["zona", "status"])).toBe("zona,status");
    expect(serializeGroupByLevels([])).toBeUndefined();
  });

  it("appends a new level and removes a selected one, shifting inner levels", () => {
    let value = toggleGroupByLevel(undefined, "status");
    value = toggleGroupByLevel(value, "fecha:dispatchDate:year");
    value = toggleGroupByLevel(value, "fecha:dispatchDate:month");
    expect(value).toBe("status,fecha:dispatchDate:year,fecha:dispatchDate:month");
    expect(toggleGroupByLevel(value, "status")).toBe("fecha:dispatchDate:year,fecha:dispatchDate:month");
    expect(toggleGroupByLevel("status", "status")).toBeUndefined();
  });

  it("date tokens never contain the level separator", () => {
    for (const option of CARD_DATE_GROUP_OPTIONS) {
      for (const child of option.children) expect(child.field).not.toContain(",");
    }
  });
});

describe("date group tokens", () => {
  it("accepts every granularity and the legacy day/month tokens", () => {
    for (const granularity of ["year", "month", "week", "day"] as const) {
      expect(parseDateGroupToken(dateGroupToken("createdAt", granularity))).toEqual({ key: "createdAt", granularity });
    }
    expect(parseDateGroupToken("fecha:dispatchDate:day")).toEqual({ key: "dispatchDate", granularity: "day" });
    expect(parseDateGroupToken("fecha:slaDueDate:month")).toEqual({ key: "slaDueDate", granularity: "month" });
    expect(parseDateGroupToken("fecha:dispatchDate:quarter")).toBeNull();
    expect(parseDateGroupToken("fecha:dispatchDate:day:extra")).toBeNull();
  });

  it("exposes one expandable option per date field with Año/Mes/Semana/Día", () => {
    const [dispatch] = cardDateGroupOptions(["dispatchDate"]);
    expect(dispatch.label).toBe("Fecha de despacho");
    expect(dispatch.children.map((child) => child.label)).toEqual(["Año", "Mes", "Semana", "Día"]);
    expect(dispatch.children.map((child) => child.field)).toContain("fecha:dispatchDate:week");
  });

  it("buckets by year and ISO week", () => {
    const card = { dispatchDate: localIso(2026, 9, 14) };
    expect(getCardDateGroup(card, "dispatchDate", "year")).toEqual({ key: "2026", label: "2026" });
    expect(getCardDateGroup(card, "dispatchDate", "week")).toEqual({ key: "2026-W38", label: "Semana 38, 2026" });
    expect(getCardDateGroup(card, "dispatchDate", "month")).toEqual({ key: "2026-09", label: "Septiembre 2026" });
    expect(getCardDateGroup(card, "dispatchDate", "day")).toEqual({ key: "2026-09-14", label: "14/09/2026" });
  });

  it("uses the ISO week-numbering year around new year", () => {
    // Friday 1 January 2027 belongs to ISO week 53 of 2026.
    const card = { dispatchDate: localIso(2027, 1, 1) };
    expect(getCardDateGroup(card, "dispatchDate", "week")).toEqual({ key: "2026-W53", label: "Semana 53, 2026" });
  });
});

describe("groupRowsNested", () => {
  const rows: Row[] = [
    { id: "a", status: "EN_RUTA", dispatchDate: localIso(2026, 9, 14) },
    { id: "b", status: "ENTREGADA", dispatchDate: localIso(2025, 12, 1) },
    { id: "c", status: "EN_RUTA", dispatchDate: null },
    { id: "d", status: "EN_RUTA", dispatchDate: localIso(2026, 1, 3) },
    { id: "e", status: "ENTREGADA", dispatchDate: localIso(2026, 9, 10) },
  ];

  it("returns null without levels", () => {
    expect(groupRowsNested(rows, [], getKey)).toBeNull();
  });

  it("keeps first-seen order for non-date levels", () => {
    expect(summarize(groupRowsNested(rows, ["status"], getKey)!)).toEqual([
      { key: "EN_RUTA", count: 3, ids: ["a", "c", "d"] },
      { key: "ENTREGADA", count: 2, ids: ["b", "e"] },
    ]);
  });

  it("sorts date levels chronologically with Sin fecha last", () => {
    expect(summarize(groupRowsNested(rows, ["fecha:dispatchDate:year"], getKey)!)).toEqual([
      { key: "2025", count: 1, ids: ["b"] },
      { key: "2026", count: 3, ids: ["a", "d", "e"] },
      { key: NO_DATE_GROUP_KEY, count: 1, ids: ["c"] },
    ]);
  });

  it("nests levels in selection order with counts per subtree", () => {
    const tree = groupRowsNested(rows, ["status", "fecha:dispatchDate:year", "fecha:dispatchDate:month"], getKey)!;
    expect(summarize(tree)).toEqual([
      {
        key: "EN_RUTA",
        count: 3,
        children: [
          {
            key: "2026",
            count: 2,
            children: [
              { key: "2026-01", count: 1, ids: ["d"] },
              { key: "2026-09", count: 1, ids: ["a"] },
            ],
          },
          { key: NO_DATE_GROUP_KEY, count: 1, children: [{ key: NO_DATE_GROUP_KEY, count: 1, ids: ["c"] }] },
        ],
      },
      {
        key: "ENTREGADA",
        count: 2,
        children: [
          { key: "2025", count: 1, children: [{ key: "2025-12", count: 1, ids: ["b"] }] },
          { key: "2026", count: 1, children: [{ key: "2026-09", count: 1, ids: ["e"] }] },
        ],
      },
    ]);
  });

  it("gives every node a unique path that includes its ancestors", () => {
    const tree = groupRowsNested(rows, ["status", "fecha:dispatchDate:year"], getKey)!;
    const paths: string[] = [];
    const walk = (nodes: GroupNode<Row>[]) => {
      for (const node of nodes) {
        paths.push(node.path);
        walk(node.children);
      }
    };
    walk(tree);
    expect(new Set(paths).size).toBe(paths.length);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].path.startsWith(tree[0].path)).toBe(true);
  });

  it("fans a row out into every bucket a multi-key level returns, at that level and below", () => {
    type GroupedRow = { id: string; status: string; groups: string[] };
    const grouped: GroupedRow[] = [
      { id: "a", status: "EN_RUTA", groups: ["g1", "g2"] },
      { id: "b", status: "ENTREGADA", groups: ["g1"] },
      { id: "c", status: "EN_RUTA", groups: [] },
    ];
    const tree = groupRowsNested(grouped, ["grupo", "status"], (row, token) =>
      token === "grupo"
        ? row.groups.length
          ? [...row.groups, row.groups[0]].map((key) => ({ key, label: key }))
          : [{ key: "SIN_GRUPO", label: "Sin grupo" }]
        : { key: row.status, label: row.status },
    )!;
    const shape = (nodes: GroupNode<GroupedRow>[]): unknown =>
      nodes.map((node) => ({
        key: node.key,
        count: node.count,
        ...(node.children.length ? { children: shape(node.children) } : { ids: node.rows.map((row) => row.id) }),
      }));
    expect(shape(tree)).toEqual([
      {
        key: "g1",
        count: 2,
        children: [
          { key: "EN_RUTA", count: 1, ids: ["a"] },
          { key: "ENTREGADA", count: 1, ids: ["b"] },
        ],
      },
      { key: "g2", count: 1, children: [{ key: "EN_RUTA", count: 1, ids: ["a"] }] },
      { key: "SIN_GRUPO", count: 1, children: [{ key: "EN_RUTA", count: 1, ids: ["c"] }] },
    ]);
  });
});
