import { describe, expect, it } from "vitest";
import { analyzeCards, expectedTcGuard, findOverwrittenReturn, type TcIntegrityCard } from "../../lib/tc-integrity";

function card(overrides: Partial<TcIntegrityCard> & { id: string }): TcIntegrityCard {
  return {
    tc: "4111111111111111",
    status: "DESPACHADA",
    returnReason: null,
    currentMessengerId: null,
    dispatchDate: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    logs: [],
    ...overrides,
  };
}

function log(toStatus: string, at: string, note: string | null = null) {
  return { fromStatus: null, toStatus, note, createdAt: new Date(at) };
}

describe("findOverwrittenReturn", () => {
  it("detects a return that a later transition overwrote", () => {
    const overwritten = findOverwrittenReturn(
      card({
        id: "a",
        status: "ENTREGADA",
        logs: [
          log("DESPACHADA", "2026-01-01"),
          log("RETORNADA", "2026-01-05", "Cliente ausente"),
          log("PUESTA_EN_RUTA", "2026-02-01"),
          log("ENTREGADA", "2026-02-02"),
        ],
      }),
    );

    expect(overwritten?.overwrittenBy.toStatus).toBe("PUESTA_EN_RUTA");
  });

  it("ignores a card that is still returned", () => {
    expect(
      findOverwrittenReturn(
        card({ id: "a", status: "RETORNADA", logs: [log("RETORNADA", "2026-01-05")] }),
      ),
    ).toBeNull();
  });

  it("ignores a card that was never returned", () => {
    expect(
      findOverwrittenReturn(card({ id: "a", status: "ENTREGADA", logs: [log("ENTREGADA", "2026-01-05")] })),
    ).toBeNull();
  });
});

describe("analyzeCards", () => {
  it("proposes restoring the older dispatch whose return was overwritten", () => {
    const violations = analyzeCards([
      card({
        id: "old",
        status: "ENTREGADA",
        dispatchDate: new Date("2026-01-01"),
        logs: [log("RETORNADA", "2026-01-05", "Cliente ausente"), log("ENTREGADA", "2026-02-02")],
      }),
      card({ id: "new", status: "DESPACHADA", dispatchDate: new Date("2026-02-01") }),
    ]);

    const overwritten = violations.find((violation) => violation.kind === "OVERWRITTEN_RETURN");
    expect(overwritten?.repair).toMatchObject({ cardId: "old", toStatus: "RETORNADA", returnReason: "Cliente ausente" });
  });

  it("does not auto-repair when the overwritten card is the newest dispatch", () => {
    const violations = analyzeCards([
      card({
        id: "newest",
        status: "ENTREGADA",
        dispatchDate: new Date("2026-03-01"),
        logs: [log("RETORNADA", "2026-03-05"), log("ENTREGADA", "2026-03-09")],
      }),
      card({ id: "older", status: "RETORNADA", dispatchDate: new Date("2026-01-01") }),
    ]);

    expect(violations.find((violation) => violation.kind === "OVERWRITTEN_RETURN")?.repair).toBeUndefined();
  });

  it("flags two simultaneously open cards for the same TC", () => {
    const violations = analyzeCards([
      card({ id: "a", status: "DESPACHADA", dispatchDate: new Date("2026-01-01") }),
      card({ id: "b", status: "PUESTA_EN_RUTA", dispatchDate: new Date("2026-02-01") }),
    ]);

    expect(violations.map((violation) => violation.kind)).toContain("MULTIPLE_OPEN_CARDS");
    expect(violations.map((violation) => violation.kind)).toContain("OPEN_PREDECESSOR");
  });

  it("reports nothing when the TC follows the golden rule", () => {
    expect(
      analyzeCards([
        card({ id: "a", status: "RETORNADA", dispatchDate: new Date("2026-01-01") }),
        card({ id: "b", status: "ENTREGADA", dispatchDate: new Date("2026-02-01") }),
      ]),
    ).toEqual([]);
  });
});

describe("expectedTcGuard", () => {
  it("locks the TC on the delivered card", () => {
    expect(
      expectedTcGuard([
        card({ id: "a", status: "RETORNADA" }),
        card({ id: "b", status: "ENTREGADA" }),
      ]),
    ).toEqual({ activeCardId: null, deliveredCardId: "b" });
  });

  it("frees the TC when every dispatch is returned", () => {
    expect(expectedTcGuard([card({ id: "a", status: "RETORNADA" })])).toEqual({
      activeCardId: null,
      deliveredCardId: null,
    });
  });
});
