import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn() } }));

import { prisma } from "@/lib/prisma";
import { cardPhoneSearchClause, phoneSearchDigits } from "@/lib/customer-phone-search";
import { tarjetasListQuery } from "@/lib/list-query/descriptors/tarjetas";
import { compile } from "@/lib/list-query";

describe("phoneSearchDigits", () => {
  it("keeps only the digits of a formatted phone", () => {
    expect(phoneSearchDigits("(809) 555-1234")).toBe("8095551234");
  });

  it("drops the country code 1 of an 11-digit number", () => {
    expect(phoneSearchDigits("+1 809-555-1234")).toBe("8095551234");
  });

  it("accepts a partial number of at least 7 digits", () => {
    expect(phoneSearchDigits("555-1234")).toBe("5551234");
  });

  it("ignores short inputs, names and card numbers", () => {
    expect(phoneSearchDigits("8095")).toBeNull();
    expect(phoneSearchDigits("Juan Perez")).toBeNull();
    expect(phoneSearchDigits("4111111111111111")).toBeNull();
    expect(phoneSearchDigits("")).toBeNull();
  });
});

describe("cardPhoneSearchClause", () => {
  it("skips the query when the input is not a phone", async () => {
    vi.mocked(prisma.$queryRaw).mockClear();
    expect(await cardPhoneSearchClause("Juan")).toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("matches cards by the ids of customers whose phones contain the digits", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }] as never);
    expect(await cardPhoneSearchClause("809-555-1234")).toEqual({ customerId: { in: ["c1", "c2"] } });
  });

  it("returns null when no customer phone matches", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never);
    expect(await cardPhoneSearchClause("8095551234")).toBeNull();
  });
});

describe("compile searchOr", () => {
  const phone = { customerId: { in: ["c1"] } };

  it("ORs the extra clauses into the free-text search", () => {
    const { where } = compile(tarjetasListQuery, new URLSearchParams("q=8095551234"), { searchOr: [phone] });
    expect((where as unknown as { OR: unknown[] }).OR).toContainEqual(phone);
  });

  it("adds nothing without a search", () => {
    const { where } = compile(tarjetasListQuery, new URLSearchParams(), { searchOr: [phone] });
    expect(JSON.stringify(where)).not.toContain("c1");
  });
});
