import { describe, expect, it } from "vitest";
import {
  deriveCardTransitionPairs,
  formatCardTransitionPairs,
  summarizeCardTransitionPairs,
} from "../../lib/card-transition-edges";

describe("observed card transition derivation", () => {
  it("deduplicates identical (fromStatus,toStatus) pairs and keeps the observed count", () => {
    const pairs = summarizeCardTransitionPairs([
      { fromStatus: "ASIGNADA", toStatus: "ENTREGADA", _count: { _all: 40 } },
      { fromStatus: "ASIGNADA", toStatus: "ENTREGADA", _count: { _all: 2 } },
      { fromStatus: "EN_RUTA", toStatus: "ENTREGADA", _count: { _all: 5 } },
    ]);

    expect(pairs).toEqual([
      { from: "ASIGNADA", to: "ENTREGADA", count: 42 },
      { from: "EN_RUTA", to: "ENTREGADA", count: 5 },
    ]);
  });

  it("keeps a null fromStatus as an explicit genesis edge instead of dropping the row", () => {
    const pairs = summarizeCardTransitionPairs([
      { fromStatus: null, toStatus: "PENDIENTE", _count: { _all: 3 } },
    ]);

    expect(pairs).toEqual([{ from: null, to: "PENDIENTE", count: 3 }]);
  });

  it("orders deterministically by from then to, with genesis edges first", () => {
    const pairs = summarizeCardTransitionPairs([
      { fromStatus: "EN_RUTA", toStatus: "DEVUELTA", _count: { _all: 1 } },
      { fromStatus: "ASIGNADA", toStatus: "EN_RUTA", _count: { _all: 9 } },
      { fromStatus: null, toStatus: "PENDIENTE", _count: { _all: 4 } },
      { fromStatus: "ASIGNADA", toStatus: "DEVUELTA", _count: { _all: 2 } },
    ]);

    expect(pairs.map((pair) => `${pair.from ?? "<null>"}->${pair.to}`)).toEqual([
      "<null>->PENDIENTE",
      "ASIGNADA->DEVUELTA",
      "ASIGNADA->EN_RUTA",
      "EN_RUTA->DEVUELTA",
    ]);
  });

  it("preserves rare single-observation edges so they are not mistaken for noise", () => {
    const pairs = summarizeCardTransitionPairs([
      { fromStatus: "ENTREGADA", toStatus: "DEVUELTA", _count: { _all: 1 } },
      { fromStatus: "ASIGNADA", toStatus: "ENTREGADA", _count: { _all: 9000 } },
    ]);

    expect(pairs).toContainEqual({ from: "ENTREGADA", to: "DEVUELTA", count: 1 });
    expect(pairs.filter((pair) => pair.count === 1)).toHaveLength(1);
  });

  it("reads through groupBy only — it never calls a mutating client method", async () => {
    const calls: string[] = [];
    const client = {
      cardStatusLog: {
        groupBy: async (args: unknown) => {
          calls.push(`groupBy:${JSON.stringify(args)}`);
          return [{ fromStatus: "ASIGNADA", toStatus: "ENTREGADA", _count: { _all: 7 } }];
        },
      },
    };

    const result = await deriveCardTransitionPairs(client);

    expect(calls).toEqual([
      `groupBy:${JSON.stringify({ by: ["fromStatus", "toStatus"], _count: { _all: true } })}`,
    ]);
    expect(result.pairs).toEqual([{ from: "ASIGNADA", to: "ENTREGADA", count: 7 }]);
    expect(result.totalObservations).toBe(7);
    expect(result.distinctPairs).toBe(1);
  });

  it("renders a paste-ready report carrying every pair and its count", () => {
    const text = formatCardTransitionPairs({
      pairs: [
        { from: null, to: "PENDIENTE", count: 4 },
        { from: "ASIGNADA", to: "ENTREGADA", count: 42 },
        { from: "ENTREGADA", to: "DEVUELTA", count: 1 },
      ],
      distinctPairs: 3,
      totalObservations: 47,
    });

    expect(text).toContain("null -> PENDIENTE");
    expect(text).toContain("ASIGNADA -> ENTREGADA");
    expect(text).toContain("ENTREGADA -> DEVUELTA");
    expect(text).toContain("42");
    expect(text).toContain("distinctPairs");
    expect(JSON.parse(text.slice(text.indexOf("{"))).pairs).toHaveLength(3);
  });
});
