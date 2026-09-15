import { describe, expect, it } from "vitest";
import { detectSwappedDispatchDate } from "@/lib/importers/swapped-dispatch-date";

const utcNoon = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 12));
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

describe("detectSwappedDispatchDate", () => {
  const importedSept14 = new Date("2026-09-14T15:00:00Z");

  it("recovers a September dispatch stored as a past month", () => {
    expect(iso(detectSwappedDispatchDate(utcNoon(2026, 3, 9), importedSept14))).toBe("2026-09-03");
  });

  it("recovers a dispatch stored in a future month", () => {
    expect(iso(detectSwappedDispatchDate(utcNoon(2026, 12, 9), importedSept14))).toBe("2026-09-12");
  });

  it("leaves a correctly dated card untouched and is idempotent", () => {
    expect(detectSwappedDispatchDate(utcNoon(2026, 9, 3), importedSept14)).toBeNull();
    expect(detectSwappedDispatchDate(utcNoon(2026, 9, 12), importedSept14)).toBeNull();
  });

  it("ignores dates whose swap is impossible or a no-op", () => {
    expect(detectSwappedDispatchDate(utcNoon(2026, 3, 20), importedSept14)).toBeNull();
    expect(detectSwappedDispatchDate(utcNoon(2026, 4, 4), importedSept14)).toBeNull();
  });

  it("ignores old dates whose swap is not plausible for the import either", () => {
    expect(detectSwappedDispatchDate(utcNoon(2026, 2, 5), importedSept14)).toBeNull();
  });
});
