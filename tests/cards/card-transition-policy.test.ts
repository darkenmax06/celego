import { describe, expect, it } from "vitest";
import {
  CARD_TRANSITION_POLICY_MODES,
  DEFAULT_CARD_TRANSITION_POLICY_MODE,
  CARD_TRANSITION_POLICY_CACHE_TTL_MS,
  createCardTransitionPolicyCache,
  isCardTransitionPolicyMode,
  parseCardTransitionPolicyMode,
  type CardTransitionPolicyMode,
} from "../../lib/card-transition-policy";

describe("card transition policy mode parsing", () => {
  it("defaults to SHADOW when the singleton row is absent", () => {
    expect(parseCardTransitionPolicyMode(null)).toBe("SHADOW");
    expect(parseCardTransitionPolicyMode(undefined)).toBe("SHADOW");
    expect(DEFAULT_CARD_TRANSITION_POLICY_MODE).toBe("SHADOW");
  });

  it("exposes exactly the three defined states", () => {
    expect(CARD_TRANSITION_POLICY_MODES).toEqual(["OFF", "SHADOW", "ENFORCE"]);
  });

  it("parses every defined state from its stored row", () => {
    for (const mode of CARD_TRANSITION_POLICY_MODES) {
      expect(parseCardTransitionPolicyMode({ mode })).toBe(mode);
    }
  });

  it("falls back to SHADOW for an unrecognised stored value instead of throwing", () => {
    expect(parseCardTransitionPolicyMode({ mode: "ENFORCED" })).toBe("SHADOW");
    expect(parseCardTransitionPolicyMode({ mode: "" })).toBe("SHADOW");
    expect(parseCardTransitionPolicyMode({ mode: 3 })).toBe("SHADOW");
  });

  it("recognises only the three defined states as valid modes", () => {
    expect(isCardTransitionPolicyMode("OFF")).toBe(true);
    expect(isCardTransitionPolicyMode("SHADOW")).toBe(true);
    expect(isCardTransitionPolicyMode("ENFORCE")).toBe(true);
    expect(isCardTransitionPolicyMode("off")).toBe(false);
    expect(isCardTransitionPolicyMode("DISABLED")).toBe(false);
  });
});

describe("card transition policy cache", () => {
  function harness(initial: CardTransitionPolicyMode = "SHADOW") {
    let clock = 0;
    let stored: CardTransitionPolicyMode = initial;
    let loads = 0;
    const cache = createCardTransitionPolicyCache({
      load: async () => {
        loads += 1;
        return stored;
      },
      now: () => clock,
    });
    return {
      cache,
      advance: (ms: number) => {
        clock += ms;
      },
      set: (mode: CardTransitionPolicyMode) => {
        stored = mode;
      },
      loads: () => loads,
    };
  }

  it("uses a 30 second time to live", () => {
    expect(CARD_TRANSITION_POLICY_CACHE_TTL_MS).toBe(30_000);
  });

  it("loads once and serves later reads from cache within the window", async () => {
    const h = harness("ENFORCE");
    expect(await h.cache.get()).toBe("ENFORCE");
    h.set("OFF");
    h.advance(CARD_TRANSITION_POLICY_CACHE_TTL_MS - 1);
    expect(await h.cache.get()).toBe("ENFORCE");
    expect(h.loads()).toBe(1);
  });

  it("reloads once the 30 second window has expired", async () => {
    const h = harness("SHADOW");
    expect(await h.cache.get()).toBe("SHADOW");
    h.set("ENFORCE");
    h.advance(CARD_TRANSITION_POLICY_CACHE_TTL_MS);
    expect(await h.cache.get()).toBe("ENFORCE");
    expect(h.loads()).toBe(2);
  });

  it("invalidates immediately after a write so a rollback needs no restart", async () => {
    const h = harness("ENFORCE");
    expect(await h.cache.get()).toBe("ENFORCE");
    h.set("OFF");
    h.cache.invalidate();
    expect(await h.cache.get()).toBe("OFF");
    expect(h.loads()).toBe(2);
  });

  it("falls back to SHADOW and does not cache the failure when the load throws", async () => {
    let fail = true;
    let loads = 0;
    const cache = createCardTransitionPolicyCache({
      load: async () => {
        loads += 1;
        if (fail) throw new Error("db down");
        return "ENFORCE" as CardTransitionPolicyMode;
      },
      now: () => 0,
    });

    expect(await cache.get()).toBe("SHADOW");
    fail = false;
    expect(await cache.get()).toBe("ENFORCE");
    expect(loads).toBe(2);
  });

  it("collapses concurrent reads into a single load", async () => {
    const h = harness("SHADOW");
    const [a, b, c] = await Promise.all([h.cache.get(), h.cache.get(), h.cache.get()]);
    expect([a, b, c]).toEqual(["SHADOW", "SHADOW", "SHADOW"]);
    expect(h.loads()).toBe(1);
  });
});
