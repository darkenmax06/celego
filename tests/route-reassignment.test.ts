import { describe, expect, it } from "vitest";
import { buildRouteReassignmentNote } from "@/lib/route-reassignment";

describe("buildRouteReassignmentNote", () => {
  it("records the prior and new route and messenger in a reassignment audit note", () => {
    expect(
      buildRouteReassignmentNote({
        previousRouteId: "route-old",
        previousMessengerName: "Ana",
        nextRouteId: "route-new",
        nextMessengerName: "Luis",
      }),
    ).toBe("Reasignada de Ana (ruta route-old) a Luis (ruta route-new)");
  });
});
