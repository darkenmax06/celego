import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD change `rutas-lotes-redesign` — Slice 4a, pulled forward from Phase 6
 * (task 5.3).
 *
 * Design decision D3 (mandatory): the observation is COMPUTED inside the
 * transaction (pure, no I/O — `buildTransitionObservation`) but WRITTEN only
 * after commit, by a separate `emitTransitionObservations()` call the future
 * handler (Slice 4b) invokes AFTER `await prisma.$transaction(...)` resolves.
 * A failed statement inside a Postgres transaction aborts the WHOLE
 * transaction even if the JS error is caught — so writing the observation
 * inside the tx could turn a harmless policy-logging failure into a broken
 * operator write. Post-commit is the only truly non-blocking option.
 *
 * Design decision D4 (mandatory): the sink is `AuditLog`
 * (`writeAuditEvent`/`tryWriteAuditEvent` from `lib/audit.ts`), NOT
 * `CardStatusLog`. `CardStatusLog` is the transition audit trail that
 * `scripts/derive-card-transitions.ts` reads to derive the empirical edge
 * set a future ENFORCE decision depends on — writing SHADOW violation rows
 * into it would poison that very evidence.
 */

vi.mock("@/lib/audit", () => ({
  tryWriteAuditEvent: vi.fn(async () => ({ id: "audit-1" })),
}));

import { tryWriteAuditEvent } from "@/lib/audit";
import {
  buildTransitionObservation,
  emitTransitionObservations,
} from "@/lib/card-transition-observer";

const mockedTryWrite = vi.mocked(tryWriteAuditEvent);

beforeEach(() => {
  mockedTryWrite.mockClear();
});

describe("buildTransitionObservation", () => {
  it("returns null for an ALLOWED edge — a listed edge needs no audit noise", () => {
    const observation = buildTransitionObservation({
      domain: "ROUTE",
      itemId: "item-1",
      cardId: "card-1",
      from: "EN_RUTA",
      to: "ACUSE_RECIBIDO",
      mode: "SHADOW",
      byUserId: "user-1",
    });
    expect(observation).toBeNull();
  });

  it("returns a populated observation for an UNLISTED edge under SHADOW mode", () => {
    const observation = buildTransitionObservation({
      domain: "LOT",
      itemId: "item-2",
      cardId: "card-2",
      from: "ACUSE_RECIBIDO",
      to: "DEVUELTA_TIENDA",
      mode: "SHADOW",
      byUserId: "user-2",
      now: () => new Date("2026-08-30T12:00:00.000Z"),
    });
    expect(observation).toMatchObject({
      domain: "LOT",
      itemId: "item-2",
      cardId: "card-2",
      edge: { from: "ACUSE_RECIBIDO", to: "DEVUELTA_TIENDA" },
      mode: "SHADOW",
      byUserId: "user-2",
      observedAt: "2026-08-30T12:00:00.000Z",
    });
    expect(observation?.evaluation).toMatchObject({ allowed: false, reason: "UNLISTED_EDGE" });
  });

  it("returns null when mode is OFF, even for an UNLISTED edge — spec scenario 'OFF mode emits nothing'", () => {
    const observation = buildTransitionObservation({
      domain: "ROUTE",
      itemId: "item-3",
      cardId: "card-3",
      from: "DEVUELTA_TIENDA",
      to: "EN_RUTA",
      mode: "OFF",
    });
    expect(observation).toBeNull();
  });

  it("still returns a populated observation for an UNLISTED edge under ENFORCE — this change never rejects, only records the mode", () => {
    const observation = buildTransitionObservation({
      domain: "ROUTE",
      itemId: "item-4",
      cardId: "card-4",
      from: "DEVUELTA_TIENDA",
      to: "EN_RUTA",
      mode: "ENFORCE",
    });
    expect(observation).toMatchObject({ mode: "ENFORCE" });
  });
});

describe("emitTransitionObservations", () => {
  it("writes one AuditLog row per non-null observation via tryWriteAuditEvent (never throws into the caller — spec scenario 'Policy error does not block write')", async () => {
    const observation = buildTransitionObservation({
      domain: "ROUTE",
      itemId: "item-5",
      cardId: "card-5",
      from: "ACUSE_RECIBIDO",
      to: "EN_RUTA",
      mode: "SHADOW",
      byUserId: "user-5",
      now: () => new Date("2026-08-30T09:00:00.000Z"),
    });

    await emitTransitionObservations([observation]);

    expect(mockedTryWrite).toHaveBeenCalledTimes(1);
    const call = mockedTryWrite.mock.calls[0][0];
    expect(call).toMatchObject({
      entity: "CARD_TRANSITION",
      entityId: "card-5",
      action: "POLICY_SHADOW_VIOLATION",
      userId: "user-5",
    });
    expect(call.details).toMatchObject({
      domain: "ROUTE",
      itemId: "item-5",
      edge: { from: "ACUSE_RECIBIDO", to: "EN_RUTA" },
      mode: "SHADOW",
      reason: "UNLISTED_EDGE",
    });
  });

  it("writes nothing and never throws when every observation is null (allowed edges, or OFF mode)", async () => {
    await expect(emitTransitionObservations([null, null])).resolves.toBeUndefined();
    expect(mockedTryWrite).not.toHaveBeenCalled();
  });

  it("writes one row per observation when given multiple, filtering out nulls in between", async () => {
    const first = buildTransitionObservation({
      domain: "ROUTE",
      itemId: "item-6",
      cardId: "card-6",
      from: "DEVUELTA_TIENDA",
      to: "EN_RUTA",
      mode: "SHADOW",
    });
    const allowedNoise = buildTransitionObservation({
      domain: "ROUTE",
      itemId: "item-7",
      cardId: "card-7",
      from: "EN_RUTA",
      to: "ACUSE_RECIBIDO",
      mode: "SHADOW",
    });
    const second = buildTransitionObservation({
      domain: "LOT",
      itemId: "item-8",
      cardId: "card-8",
      from: "DEVUELTA_TIENDA",
      to: "ACUSE_RECIBIDO",
      mode: "SHADOW",
    });

    await emitTransitionObservations([first, allowedNoise, second]);

    expect(mockedTryWrite).toHaveBeenCalledTimes(2);
  });
});
