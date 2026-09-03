import { describe, expect, it } from "vitest";
import {
  buildLegacyTorreBackfillPlan,
  LEGACY_TORRE_BACKFILL_AUDIT,
} from "../../lib/dispatch-origin-backfill";

describe("legacy Torre Popular backfill plan", () => {
  it("selects only cards without a source key and builds Torre Popular UTC keys", () => {
    const plan = buildLegacyTorreBackfillPlan(
      [
        {
          id: "candidate",
          tc: "4111 1111 1111 1111",
          sourceRecordKey: null,
          customer: { cedula: "001-1234567-8" },
          dispatchDate: new Date("2026-08-20T23:30:00-04:00"),
        },
        {
          id: "preserved",
          tc: "4222222222222222",
          sourceRecordKey: "CENTRO_ACOPIO|4222222222222222|00112345678|2026-08-20",
          customer: { cedula: "00112345678" },
          dispatchDate: new Date("2026-08-20T00:00:00.000Z"),
        },
      ],
      new Set(),
    );

    expect(plan.candidates).toEqual([
      {
        cardId: "candidate",
        sourceRecordKey: "TORRE_POPULAR|4111111111111111|00112345678|2026-08-21",
      },
    ]);
    expect(plan.report.selectedCards).toBe(1);
    expect(plan.report.existingSourceKeys).toBe(1);
    expect(plan.report.invalidCards).toBe(0);
    expect(plan.isClean).toBe(true);
    expect(LEGACY_TORRE_BACKFILL_AUDIT).toEqual({
      entity: "CARD_BACKFILL",
      entityId: "legacy-torre-popular-v1",
      action: "APPLY",
    });
  });

  it("preserves a present legacy demo TC instead of fabricating a production card number", () => {
    const plan = buildLegacyTorreBackfillPlan(
      [{
        id: "demo",
        tc: " DEMO-ADD-001 ",
        sourceRecordKey: null,
        customer: { cedula: "00112345678" },
        dispatchDate: new Date("2026-08-20T00:00:00.000Z"),
      }],
      new Set(),
    );

    expect(plan.candidates).toEqual([
      { cardId: "demo", sourceRecordKey: "TORRE_POPULAR|DEMO-ADD-001|00112345678|2026-08-20" },
    ]);
    expect(plan.isClean).toBe(true);
  });

  it("reports invalid components, duplicate candidates, and existing-key collisions as apply blockers", () => {
    const plan = buildLegacyTorreBackfillPlan(
      [
        {
          id: "missing-date",
          tc: "4111111111111111",
          sourceRecordKey: null,
          customer: { cedula: "00112345678" },
          dispatchDate: null,
        },
        {
          id: "duplicate-a",
          tc: "4111111111111111",
          sourceRecordKey: null,
          customer: { cedula: "00112345678" },
          dispatchDate: new Date("2026-08-20T00:00:00.000Z"),
        },
        {
          id: "duplicate-b",
          tc: "4111111111111111",
          sourceRecordKey: null,
          customer: { cedula: "00112345678" },
          dispatchDate: new Date("2026-08-20T12:00:00.000Z"),
        },
      ],
      new Set(["TORRE_POPULAR|4111111111111111|00112345678|2026-08-20"]),
    );

    expect(plan.report.missingComponents).toEqual({ tc: 0, cedula: 0, dispatchDate: 1 });
    expect(plan.report.duplicateCandidateKeys).toEqual([
      "TORRE_POPULAR|4111111111111111|00112345678|2026-08-20",
    ]);
    expect(plan.report.existingKeyCollisions).toEqual([
      "TORRE_POPULAR|4111111111111111|00112345678|2026-08-20",
    ]);
    expect(plan.isClean).toBe(false);
  });
});
