import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRouteItemCheckedAt } from "../../lib/route-proof-write";

const ROUTE_FILE = "app/api/mobile/rutas/pruebas/route.ts";

function readRouteSource(): string {
  return readFileSync(path.join(process.cwd(), ROUTE_FILE), "utf8");
}

/**
 * Extracts the body of the `prisma.$transaction(async (tx) => { ... })` callback.
 * Brace-matched rather than regex-sliced so a nested block cannot end it early.
 */
function extractTransactionBody(source: string): string {
  const marker = "prisma.$transaction(async (tx) => {";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`No $transaction callback found in ${ROUTE_FILE}`);

  let depth = 0;
  const from = start + marker.length - 1;
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(from + 1, i);
    }
  }
  throw new Error(`Unbalanced $transaction callback in ${ROUTE_FILE}`);
}

describe("route-item checkedAt rule", () => {
  const now = new Date("2026-08-29T12:00:00.000Z");

  it("clears checkedAt when the item goes back out on route", () => {
    expect(resolveRouteItemCheckedAt("EN_RUTA", now)).toBeNull();
  });

  it("stamps checkedAt for a delivery-closing status", () => {
    expect(resolveRouteItemCheckedAt("ACUSE_RECIBIDO", now)).toBe(now);
    expect(resolveRouteItemCheckedAt("DEVUELTA_TIENDA", now)).toBe(now);
  });
});

/**
 * Task 16.6 decision: these SOURCE anchors are KEPT, not replaced.
 *
 * `tests/cards/route-proof-rollback.test.ts` now proves the rollback by really
 * executing the handler, which is the stronger guarantee for the regression that
 * actually happened (the `routeItem` write running before the transaction).
 * These assertions cover what execution cannot: that NO non-transactional
 * `prisma.routeItem.update` exists anywhere in the handler, including in
 * branches no test exercises. The two are complementary, so both stay.
 */
describe("mobile delivery-proof route writes atomically", () => {
  it("performs the routeItem write through the transaction client", () => {
    const body = extractTransactionBody(readRouteSource());
    expect(body).toContain("tx.routeItem.update");
  });

  it("never mutates routeItem outside the transaction", () => {
    const source = readRouteSource();
    const body = extractTransactionBody(source);
    const outside = source.replace(body, "");

    // A failure inside the transaction must roll `checkedAt` back with the rest
    // of the write. A non-transactional `prisma.routeItem.update` anywhere in
    // this handler would leave it mutated after a rollback.
    expect(outside).not.toContain("prisma.routeItem.update");
    expect(source).not.toContain("await prisma.routeItem.update");
  });

  it("keeps the card write, the urgency clear and the status log in the same transaction", () => {
    const body = extractTransactionBody(readRouteSource());
    expect(body).toContain("tx.card.update");
    expect(body).toContain("tx.cardStatusLog.create");
    expect(body).toContain("clearUrgencyOnCardClosure");
  });

  it("derives checkedAt through the shared rule instead of inlining it", () => {
    expect(readRouteSource()).toContain("resolveRouteItemCheckedAt");
  });
});
