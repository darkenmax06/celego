import { describe, expect, it } from "vitest";
import { mapLotStatus } from "@/lib/lot-status";

/**
 * SDD change `rutas-lotes-redesign` — Slice 3 (task 3.1/3.3).
 *
 * Pure normalizer from the free-text `Lot.estatus` column to the new typed
 * `LotStatus` enum. Deliberately minimal domain (see `LotStatus`'s doc
 * comment in prisma/schema.prisma): only the two literal values confirmed in
 * code today map to a typed value. Everything else is report-and-skip — the
 * caller leaves `estatusTipo` null and keeps serving reads from `estatus`.
 */
describe("mapLotStatus", () => {
  it("maps the Zod creation default 'EN TRANSITO' to LotStatus.EN_TRANSITO", () => {
    expect(mapLotStatus("EN TRANSITO")).toBe("EN_TRANSITO");
  });

  it("maps the importer default 'PENDIENTE' to LotStatus.PENDIENTE", () => {
    expect(mapLotStatus("PENDIENTE")).toBe("PENDIENTE");
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(mapLotStatus("  en transito  ")).toBe("EN_TRANSITO");
    expect(mapLotStatus("pendiente")).toBe("PENDIENTE");
  });

  it("strips diacritics before matching", () => {
    expect(mapLotStatus("PENDIÉNTE")).toBe("PENDIENTE");
  });

  it("returns null (report-and-skip) for an unrecognized free-text value", () => {
    expect(mapLotStatus("RECIBIDO EN BANCO")).toBeNull();
  });

  it("returns null for empty, null, or undefined input", () => {
    expect(mapLotStatus("")).toBeNull();
    expect(mapLotStatus(null)).toBeNull();
    expect(mapLotStatus(undefined)).toBeNull();
  });
});
