import { describe, expect, it } from "vitest";
import { createLatestOnly } from "@/lib/latest-only";

describe("createLatestOnly", () => {
  it("drops a stale response that resolves after a newer request", async () => {
    const guard = createLatestOnly();
    const applied: string[] = [];
    const request = (value: string, delay: number) => {
      const token = guard.start();
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          if (guard.isLatest(token)) applied.push(value);
          resolve();
        }, delay),
      );
    };

    // ALL fires first (slow), then DEBITO (fast): ALL must not overwrite DEBITO.
    await Promise.all([request("ALL", 30), request("DEBITO", 5)]);
    expect(applied).toEqual(["DEBITO"]);
  });

  it("applies a single request", () => {
    const guard = createLatestOnly();
    expect(guard.isLatest(guard.start())).toBe(true);
  });
});
