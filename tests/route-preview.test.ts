import { describe, expect, it } from "vitest";
import {
  buildResolvedCardsPreviewSummary,
  getPostCreateRouteBrowseFilters,
} from "../lib/route-preview";

describe("route preview for scanner-resolved cards", () => {
  it("counts selected cards as found instead of returning an empty summary", () => {
    expect(buildResolvedCardsPreviewSummary(2)).toEqual({
      found: 2,
      ambiguous: 0,
      notFound: 0,
      alreadyAssigned: 0,
      notEligible: 0,
      duplicates: 0,
    });
  });
});

describe("route list after creation", () => {
  it("keeps the existing range and expands it to include the new route", () => {
    expect(getPostCreateRouteBrowseFilters({
      createdDate: "2026-06-21",
      currentFrom: "2026-08-18",
      currentTo: "2026-09-16",
    })).toEqual({
      from: "2026-06-21",
      to: "2026-09-16",
      messengerId: "ALL",
      productType: "ALL",
    });
  });

  it("also expands the upper bound for a future route", () => {
    expect(getPostCreateRouteBrowseFilters({
      createdDate: "2026-10-01",
      currentFrom: "2026-08-18",
      currentTo: "2026-09-16",
    }).to).toBe("2026-10-01");
  });
});
