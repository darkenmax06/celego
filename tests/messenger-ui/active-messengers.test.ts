import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { filterActiveMessengers, reconcileMessengerId, restorableMessengerId } from "@/lib/active-messengers";

const active = { id: "a", nombre: "Ana", activo: true };
const archived = { id: "b", nombre: "Beto", activo: false };

describe("active messenger helpers (R5.1)", () => {
  it("keeps only active messengers", () => {
    expect(filterActiveMessengers([active, archived])).toEqual([active]);
  });

  it("restores a draft id only when it is in the active list", () => {
    expect(restorableMessengerId("a", [active])).toBe("a");
    expect(restorableMessengerId("b", [active])).toBe("");
    expect(restorableMessengerId("", [active])).toBe("");
  });

  it("reconciles a stale id to the first active messenger, or empty when none", () => {
    expect(reconcileMessengerId("a", [active])).toBe("a");
    expect(reconcileMessengerId("b", [active])).toBe("a");
    expect(reconcileMessengerId("", [active])).toBe("a");
    expect(reconcileMessengerId("b", [])).toBe("");
  });
});

describe("rutas-client wiring (R5.1)", () => {
  const source = readFileSync(
    path.join(process.cwd(), "app", "(protected)", "rutas", "rutas-client.tsx"),
    "utf-8",
  );

  it("restores draft messenger ids as-is so draft autosave keeps working", () => {
    expect(source).toMatch(/setMessengerId\(draft\.messengerId\)/);
    expect(source).toMatch(/setLotMessengerId\(draft\.lotMessengerId\)/);
    expect(source).not.toMatch(/restorableMessengerId/);
  });

  it("reconciles stale ids only after the messenger list has loaded", () => {
    expect(source).toMatch(/messengersLoaded/);
    expect(source).toMatch(/reconcileMessengerId\(messengerId, activeMessengers\)/);
    expect(source).toMatch(/reconcileMessengerId\(lotMessengerId, activeMessengers\)/);
  });

  it("defaults to the first active messenger", () => {
    expect(source).toMatch(/const activeList = filterActiveMessengers<Messenger>\(list\)/);
    expect(source).toMatch(/setMessengerId\(activeList\[0\]\.id\)/);
    expect(source).toMatch(/setLotMessengerId\(activeList\[0\]\.id\)/);
  });

  it("uses active messengers in create pickers and the full list in browse filters", () => {
    expect(source).toMatch(/value=\{messengerId\}[\s\S]{1,200}\{activeMessengers\.map/);
    expect(source).toMatch(/value=\{lotMessengerId\}[\s\S]{1,300}\{activeMessengers\.map/);
    expect(source).toMatch(/value=\{browseMessengerId\}[\s\S]{1,300}\{messengers\.map/);
    expect(source).toMatch(/aria-label="Mensajero de lotes"[\s\S]{1,300}\{messengers\.map/);
  });
});
