import { describe, expect, it } from "vitest";
import { DIGIT_PLACEHOLDER_LENGTH, displayDigits, displayPhone, displayText } from "../lib/display";

describe("displayText", () => {
  it("returns N/A for null, undefined, empty and whitespace-only values", () => {
    expect(displayText(null)).toBe("N/A");
    expect(displayText(undefined)).toBe("N/A");
    expect(displayText("")).toBe("N/A");
    expect(displayText("   ")).toBe("N/A");
  });

  it("trims and returns the value when present", () => {
    expect(displayText("  Torre Popular  ")).toBe("Torre Popular");
  });

  it("keeps falsy-looking but meaningful values", () => {
    expect(displayText("0")).toBe("0");
  });
});

describe("displayDigits", () => {
  it("returns a zero sequence of the requested length when the value is missing", () => {
    expect(displayDigits(null, 5)).toBe("00000");
    expect(displayDigits("  ", DIGIT_PLACEHOLDER_LENGTH.cedula)).toBe("00000000000");
  });

  it("returns the trimmed value when present", () => {
    expect(displayDigits(" 40212345678 ", DIGIT_PLACEHOLDER_LENGTH.cedula)).toBe("40212345678");
  });
});

describe("displayPhone", () => {
  it("falls back to a ten-zero sequence", () => {
    expect(displayPhone(null)).toBe("0000000000");
  });

  it("preserves multi-phone strings", () => {
    expect(displayPhone("8091234567 | 8299876543")).toBe("8091234567 | 8299876543");
  });
});
