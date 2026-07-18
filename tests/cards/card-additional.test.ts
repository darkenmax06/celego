import { describe, expect, it } from "vitest";
import { computeAdditionalAssignments } from "../../lib/card-additional";

function card(input: {
  id: string;
  cedula: string;
  dispatchDate: string | null;
  createdAt: string;
}) {
  return {
    id: input.id,
    createdAt: new Date(input.createdAt),
    dispatchDate: input.dispatchDate ? new Date(input.dispatchDate) : null,
    customer: {
      cedula: input.cedula,
    },
  };
}

describe("card additional detection", () => {
  it("marks every card after the first cedula/dispatch-date match as additional", () => {
    const assignments = computeAdditionalAssignments([
      card({
        id: "second",
        cedula: "402-3138262-9",
        dispatchDate: "2026-06-10T16:00:00.000Z",
        createdAt: "2026-06-10T10:01:00.000Z",
      }),
      card({
        id: "first",
        cedula: "40231382629",
        dispatchDate: "2026-06-10T16:00:00.000Z",
        createdAt: "2026-06-10T10:00:00.000Z",
      }),
      card({
        id: "third",
        cedula: "40231382629",
        dispatchDate: "2026-06-10T16:00:00.000Z",
        createdAt: "2026-06-10T10:02:00.000Z",
      }),
    ]);

    expect(assignments).toEqual(
      expect.arrayContaining([
        { id: "first", isAdditional: false, additionalIndex: 0 },
        { id: "second", isAdditional: true, additionalIndex: 1 },
        { id: "third", isAdditional: true, additionalIndex: 2 },
      ]),
    );
  });

  it("does not mark different dates or empty dispatch dates as additional", () => {
    const assignments = computeAdditionalAssignments([
      card({
        id: "day-one",
        cedula: "40231382629",
        dispatchDate: "2026-06-10T16:00:00.000Z",
        createdAt: "2026-06-10T10:00:00.000Z",
      }),
      card({
        id: "day-two",
        cedula: "40231382629",
        dispatchDate: "2026-06-11T16:00:00.000Z",
        createdAt: "2026-06-11T10:00:00.000Z",
      }),
      card({
        id: "no-date",
        cedula: "40231382629",
        dispatchDate: null,
        createdAt: "2026-06-12T10:00:00.000Z",
      }),
    ]);

    expect(assignments).toEqual(
      expect.arrayContaining([
        { id: "day-one", isAdditional: false, additionalIndex: 0 },
        { id: "day-two", isAdditional: false, additionalIndex: 0 },
        { id: "no-date", isAdditional: false, additionalIndex: 0 },
      ]),
    );
  });
});

