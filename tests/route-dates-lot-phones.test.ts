import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatDateOnly } from "../lib/date";
import { lotItemPhoneNumbers } from "../lib/lot-phones";

describe("formatDateOnly", () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Santo_Domingo";
  });
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("shows the saved day, not the previous one, in a timezone behind UTC", () => {
    const saved = new Date("2026-10-09");
    expect(saved.toLocaleDateString("es-DO")).toBe("8/10/2026");
    expect(formatDateOnly(saved)).toBe("9/10/2026");
    expect(formatDateOnly("2026-10-09T00:00:00.000Z")).toBe("9/10/2026");
  });

  it("returns a dash for empty or invalid values", () => {
    expect(formatDateOnly(null)).toBe("-");
    expect(formatDateOnly("nope")).toBe("-");
  });
});

describe("lotItemPhoneNumbers", () => {
  it("lists every customer number plus the lot snapshot, without repeats", () => {
    const phones = lotItemPhoneNumbers({
      telefono: "8092287374",
      card: { customer: { telefonosRaw: "8092287374 | 809-555-1111 | 8495552222" } },
    });
    expect(phones).toEqual(["8092287374", "809-555-1111", "8495552222"]);
  });

  it("falls back to the snapshot when the card is gone", () => {
    expect(lotItemPhoneNumbers({ telefono: "8092287374 | 8295550000", card: null })).toEqual(["8092287374", "8295550000"]);
    expect(lotItemPhoneNumbers({ telefono: null, card: null })).toEqual([]);
  });
});
