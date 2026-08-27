import { describe, expect, it } from "vitest";
import {
  buildDailyImportCardLookup,
  compareOperationalCardRecency,
  isOperationalCardClosed,
  resolveOperationalCardLookup,
  type OperationalCardCandidate,
} from "../../lib/operational-card-lookup";

type TestCard = OperationalCardCandidate & {
  updatedAt: Date;
  customer: {
    cedula: string;
  };
};

function card(input: {
  id: string;
  tc: string;
  cedula?: string;
  externalReference?: string | null;
  status?: string;
  dispatchDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  returnReason?: string | null;
}): TestCard {
  return {
    id: input.id,
    tc: input.tc,
    externalReference: input.externalReference ?? null,
    status: input.status ?? "DESPACHADA",
    dispatchDate: input.dispatchDate ? new Date(input.dispatchDate) : null,
    createdAt: new Date(input.createdAt ?? "2026-06-01T10:00:00.000Z"),
    // This is intentionally available to prove that it has no influence on
    // operational lookup ordering.
    updatedAt: new Date(input.updatedAt ?? "2026-06-01T10:00:00.000Z"),
    returnReason: input.returnReason ?? null,
    customer: {
      cedula: input.cedula ?? "402-3138262-9",
    },
  };
}

describe("operational card lookup", () => {
  it("selects the new dispatch instead of a recently updated historical return", () => {
    const returnedHistory = card({
      id: "old-return",
      tc: "TC-100",
      status: "RETORNADA",
      dispatchDate: "2026-05-01T12:00:00.000Z",
      createdAt: "2026-05-01T08:00:00.000Z",
      updatedAt: "2026-06-30T12:00:00.000Z",
      returnReason: "Cliente no localizado",
    });
    const redispached = card({
      id: "new-dispatch",
      tc: "TC-100",
      status: "DESPACHADA",
      dispatchDate: "2026-06-15T12:00:00.000Z",
      createdAt: "2026-06-15T08:00:00.000Z",
      updatedAt: "2026-06-15T08:00:00.000Z",
    });

    const result = resolveOperationalCardLookup(
      { kind: "TC", value: "tc 100" },
      [returnedHistory, redispached],
    );

    expect(result).toMatchObject({ kind: "RESUELTA", card: { id: "new-dispatch" } });
  });

  it("selects the latest open version for a repeated reference", () => {
    const result = resolveOperationalCardLookup(
      { kind: "REFERENCIA", value: "REF-44" },
      [
        card({
          id: "old",
          tc: "TC-OLD",
          externalReference: "ref 44",
          dispatchDate: "2026-05-01T12:00:00.000Z",
          createdAt: "2026-05-01T08:00:00.000Z",
        }),
        card({
          id: "new",
          tc: "TC-NEW",
          externalReference: "REF-44",
          dispatchDate: "2026-06-01T12:00:00.000Z",
          createdAt: "2026-06-01T08:00:00.000Z",
        }),
      ],
    );

    expect(result).toMatchObject({ kind: "RESUELTA", card: { id: "new" } });
  });

  it("orders ties deterministically by id after dispatch and creation dates", () => {
    const cards = [
      card({
        id: "z-card",
        tc: "TC-200",
        dispatchDate: "2026-06-01T12:00:00.000Z",
        createdAt: "2026-06-01T08:00:00.000Z",
      }),
      card({
        id: "a-card",
        tc: "TC-200",
        dispatchDate: "2026-06-01T12:00:00.000Z",
        createdAt: "2026-06-01T08:00:00.000Z",
      }),
    ];

    expect([...cards].sort(compareOperationalCardRecency).map((item) => item.id)).toEqual([
      "a-card",
      "z-card",
    ]);
    expect(resolveOperationalCardLookup({ kind: "TC", value: "TC-200" }, cards)).toMatchObject({
      kind: "RESUELTA",
      card: { id: "a-card" },
    });
  });

  it("puts cards without a dispatch date after dated cards, then uses creation date", () => {
    const cards = [
      card({
        id: "without-date-older",
        tc: "TC-NULL-DATE",
        dispatchDate: null,
        createdAt: "2026-06-02T08:00:00.000Z",
      }),
      card({
        id: "without-date-newer",
        tc: "TC-NULL-DATE",
        dispatchDate: null,
        createdAt: "2026-06-03T08:00:00.000Z",
      }),
      card({
        id: "with-date",
        tc: "TC-NULL-DATE",
        dispatchDate: "2026-06-01T12:00:00.000Z",
        createdAt: "2026-06-01T08:00:00.000Z",
      }),
    ];

    expect([...cards].sort(compareOperationalCardRecency).map((item) => item.id)).toEqual([
      "with-date",
      "without-date-newer",
      "without-date-older",
    ]);
  });

  it("asks for selection when a cédula has several current TC values", () => {
    const result = resolveOperationalCardLookup(
      { kind: "CEDULA", value: "40231382629" },
      [
        card({
          id: "tc-one",
          tc: "TC-ONE",
          dispatchDate: "2026-06-01T12:00:00.000Z",
        }),
        card({
          id: "tc-two",
          tc: "TC-TWO",
          dispatchDate: "2026-06-02T12:00:00.000Z",
        }),
        card({
          id: "closed-history",
          tc: "TC-OLD",
          status: "DEVUELTA_TIENDA",
          dispatchDate: "2026-06-03T12:00:00.000Z",
          returnReason: "Retorno de tienda",
        }),
      ],
    );

    expect(result.kind).toBe("REQUIERE_SELECCION");
    if (result.kind !== "REQUIERE_SELECCION") return;
    expect(result.options.map((item) => item.id)).toEqual(["tc-two", "tc-one"]);
  });

  it("returns a single closed card with its return reason for explicit confirmation", () => {
    const result = resolveOperationalCardLookup(
      { kind: "TC", value: "TC-CLOSED" },
      [
        card({
          id: "closed",
          tc: "TC-CLOSED",
          status: "RETORNADA",
          returnReason: "Cliente ausente",
        }),
      ],
    );

    expect(result).toMatchObject({
      kind: "SOLO_CERRADAS",
      closedCards: [{ id: "closed", status: "RETORNADA", returnReason: "Cliente ausente" }],
    });
  });

  it("resolves a cedula with one current TC to the most recent open version", () => {
    const result = resolveOperationalCardLookup(
      { kind: "CEDULA", value: "402-3138262-9" },
      [
        card({
          id: "older-open-version",
          tc: "TC-ONE",
          dispatchDate: "2026-06-01T12:00:00.000Z",
        }),
        card({
          id: "newer-open-version",
          tc: "TC-ONE",
          dispatchDate: "2026-06-02T12:00:00.000Z",
        }),
      ],
    );

    expect(result).toMatchObject({ kind: "RESUELTA", card: { id: "newer-open-version" } });
  });

  it("reports no result when no candidate matches the explicit lookup", () => {
    expect(
      resolveOperationalCardLookup({ kind: "TC", value: "TC-MISSING" }, [
        card({ id: "existing", tc: "TC-EXISTING" }),
      ]),
    ).toEqual({ kind: "NO_ENCONTRADA" });
  });
});

describe("daily import card lookup", () => {
  it("keeps a missing dispatch date scoped to undated instances", () => {
    expect(
      buildDailyImportCardLookup({
        tc: "TC-100",
        customerId: "customer-1",
        dispatchDate: null,
      }),
    ).toEqual({
      tc: "TC-100",
      customerId: "customer-1",
      dispatchDate: null,
    });
  });

  it("does not treat a missing date as an omitted lookup filter", () => {
    expect(
      buildDailyImportCardLookup({
        tc: "TC-100",
        customerId: "customer-1",
        dispatchDate: undefined,
      }),
    ).toMatchObject({ dispatchDate: null });
  });

  it("keeps a supplied dispatch date as the exact instance discriminator", () => {
    const dispatchDate = new Date("2026-06-15T12:00:00.000Z");

    expect(
      buildDailyImportCardLookup({
        tc: "TC-100",
        customerId: "customer-1",
        dispatchDate,
      }),
    ).toEqual({
      tc: "TC-100",
      customerId: "customer-1",
      dispatchDate,
    });
  });
});

describe("operationally closed statuses", () => {
  it("only closes returned lifecycle instances", () => {
    expect(isOperationalCardClosed("RETORNADA")).toBe(true);
    expect(isOperationalCardClosed("DEVUELTA_TIENDA")).toBe(true);
    expect(isOperationalCardClosed("ENTREGADA")).toBe(false);
    expect(isOperationalCardClosed("ENTREGA_DIGITAL")).toBe(false);
  });
});
