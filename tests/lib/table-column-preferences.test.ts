import { describe, expect, it } from "vitest";
import { TARJETAS_COLUMNS } from "@/lib/table-columns/catalogs";
import {
  columnPreferencesFromVisibleKeys,
  defaultColumnPreferences,
  mergeColumnPreferences,
  visibleColumnKeys,
  type TableColumnCatalogEntry,
} from "@/lib/table-columns/column-preferences";

const CATALOG: TableColumnCatalogEntry[] = [
  { key: "tc", label: "TC", locked: true },
  { key: "cliente", label: "Cliente" },
  { key: "estado", label: "Estado" },
  { key: "createdAt", label: "Creación", defaultVisible: false },
];

describe("mergeColumnPreferences", () => {
  it("returns the catalog defaults when nothing is saved", () => {
    expect(mergeColumnPreferences(CATALOG, null)).toEqual([
      { key: "tc", visible: true },
      { key: "cliente", visible: true },
      { key: "estado", visible: true },
      { key: "createdAt", visible: false },
    ]);
  });

  it("keeps the saved order, drops unknown keys (including the retired acciones) and duplicates", () => {
    const merged = mergeColumnPreferences(CATALOG, [
      { key: "estado", visible: true },
      { key: "acciones", visible: true },
      { key: "cliente", visible: false },
      { key: "estado", visible: false },
      { key: "nope", visible: true },
      "garbage",
      { visible: true },
    ]);
    expect(merged.map((column) => column.key)).toEqual(["estado", "cliente", "tc", "createdAt"]);
    expect(merged.find((column) => column.key === "estado")?.visible).toBe(true);
    expect(merged.find((column) => column.key === "cliente")?.visible).toBe(false);
  });

  it("appends columns added after the layout was saved with their default visibility", () => {
    const merged = mergeColumnPreferences(CATALOG, [
      { key: "cliente", visible: true },
      { key: "tc", visible: true },
    ]);
    expect(merged).toEqual([
      { key: "cliente", visible: true },
      { key: "tc", visible: true },
      { key: "estado", visible: true },
      { key: "createdAt", visible: false },
    ]);
  });

  it("forces locked columns visible and restores defaults when nothing would be visible", () => {
    expect(mergeColumnPreferences(CATALOG, [{ key: "tc", visible: false }])[0]).toEqual({ key: "tc", visible: true });

    const noLocked = CATALOG.filter((column) => !column.locked);
    expect(
      mergeColumnPreferences(noLocked, noLocked.map((column) => ({ key: column.key, visible: false }))),
    ).toEqual(defaultColumnPreferences(noLocked));
  });

  it("treats a non-array saved value as no layout", () => {
    expect(mergeColumnPreferences(CATALOG, { columns: [] })).toEqual(defaultColumnPreferences(CATALOG));
  });

  it("keeps Tarjetas date columns hidden by default and has no acciones column", () => {
    const visible = visibleColumnKeys(defaultColumnPreferences(TARJETAS_COLUMNS));
    expect(visible).toContain("tc");
    expect(visible).not.toContain("createdAt");
    expect(TARJETAS_COLUMNS.some((column) => (column.key as string) === "acciones")).toBe(false);
  });
});

describe("columnPreferencesFromVisibleKeys", () => {
  it("migrates a legacy visible-columns list in catalog order", () => {
    expect(columnPreferencesFromVisibleKeys(CATALOG, ["createdAt", "tc", "acciones"])).toEqual([
      { key: "tc", visible: true },
      { key: "cliente", visible: false },
      { key: "estado", visible: false },
      { key: "createdAt", visible: true },
    ]);
  });

  it("returns null when there is nothing usable to migrate", () => {
    expect(columnPreferencesFromVisibleKeys(CATALOG, undefined)).toBeNull();
    expect(columnPreferencesFromVisibleKeys(CATALOG, ["acciones"])).toBeNull();
    expect(columnPreferencesFromVisibleKeys(CATALOG, "tc")).toBeNull();
  });
});
