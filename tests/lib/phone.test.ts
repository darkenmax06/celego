import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl, formatPhoneDisplay, phoneDigits, toWhatsAppNumber } from "@/lib/phone";

describe("phoneDigits", () => {
  it("strips non-digits", () => {
    expect(phoneDigits("(809) 555-1234")).toBe("8095551234");
  });

  it("drops text after ext / x markers", () => {
    expect(phoneDigits("809-555-1234 ext 12")).toBe("8095551234");
    expect(phoneDigits("809-555-1234 x12")).toBe("8095551234");
    expect(phoneDigits("809-555-1234 Ext. 7")).toBe("8095551234");
  });

  it("drops extensions attached to the number", () => {
    expect(phoneDigits("8095551234x12")).toBe("8095551234");
    expect(phoneDigits("8095551234ext12")).toBe("8095551234");
  });

  it("returns an empty string for empty input", () => {
    expect(phoneDigits("")).toBe("");
  });
});

describe("formatPhoneDisplay", () => {
  it("formats exactly 10 digits as 000-000-0000", () => {
    expect(formatPhoneDisplay("8095551234")).toBe("809-555-1234");
  });

  it("drops the leading country code 1 of 11-digit numbers", () => {
    expect(formatPhoneDisplay("+1 809 555 1234")).toBe("809-555-1234");
    expect(formatPhoneDisplay("18095551234")).toBe("809-555-1234");
  });

  it("formats numbers with an attached extension", () => {
    expect(formatPhoneDisplay("8095551234x12")).toBe("809-555-1234");
  });

  it("shows bare digits for other lengths", () => {
    expect(formatPhoneDisplay("5551234")).toBe("5551234");
    expect(formatPhoneDisplay("+34 600 123 456")).toBe("34600123456");
  });

  it("falls back to the trimmed raw value when there are no digits", () => {
    expect(formatPhoneDisplay("  N/A  ")).toBe("N/A");
  });
});

describe("toWhatsAppNumber", () => {
  it("prefixes 1 for 10-digit Dominican area codes", () => {
    expect(toWhatsAppNumber("8295551234")).toEqual({ ok: true, number: "18295551234" });
    expect(toWhatsAppNumber("8095551234")).toEqual({ ok: true, number: "18095551234" });
    expect(toWhatsAppNumber("8495551234")).toEqual({ ok: true, number: "18495551234" });
  });

  it("keeps 11-digit numbers starting with 1", () => {
    expect(toWhatsAppNumber("+1 809 555 1234")).toEqual({ ok: true, number: "18095551234" });
    expect(toWhatsAppNumber("18095551234")).toEqual({ ok: true, number: "18095551234" });
  });

  it("ignores extensions before converting", () => {
    expect(toWhatsAppNumber("809-555-1234 ext 12")).toEqual({ ok: true, number: "18095551234" });
  });

  it("rejects 7-digit numbers asking for the area code", () => {
    expect(toWhatsAppNumber("5551234")).toEqual({ ok: false, reason: "Falta el código de área" });
  });

  it("rejects international and empty numbers", () => {
    expect(toWhatsAppNumber("+34 600 123 456")).toEqual({
      ok: false,
      reason: "Número no compatible con WhatsApp",
    });
    expect(toWhatsAppNumber("")).toEqual({
      ok: false,
      reason: "Número no compatible con WhatsApp",
    });
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me URL with the encoded text", () => {
    expect(buildWhatsAppUrl("18295551234", "Hola, ¿qué tal? & más")).toBe(
      `https://wa.me/18295551234?text=${encodeURIComponent("Hola, ¿qué tal? & más")}`,
    );
  });
});
