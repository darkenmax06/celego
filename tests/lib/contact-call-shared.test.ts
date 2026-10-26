import { describe, expect, it } from "vitest";
import {
  CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE,
  CONTACTED_CALL_PHONE_REQUIRED_MESSAGE,
  validateContactedCall,
} from "@/lib/contact-call-shared";

const ok = { num: "8095551234", funciona: true };

describe("validateContactedCall", () => {
  it("accepts a working phone with a channel", () => {
    expect(
      validateContactedCall({ phones: [ok], canalContacto: "WHATSAPP", telefonosExplicitEmpty: false }),
    ).toBeNull();
  });

  it("rejects explicit empty phones", () => {
    expect(
      validateContactedCall({ phones: [ok], canalContacto: "WHATSAPP", telefonosExplicitEmpty: true }),
    ).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
  });

  it("rejects phones that do not work", () => {
    expect(
      validateContactedCall({
        phones: [{ num: "8095551234", funciona: false }],
        canalContacto: "WHATSAPP",
        telefonosExplicitEmpty: false,
      }),
    ).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
  });

  it("rejects working phones under 7 digits", () => {
    expect(
      validateContactedCall({
        phones: [{ num: "55512", funciona: true }],
        canalContacto: "WHATSAPP",
        telefonosExplicitEmpty: false,
      }),
    ).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
  });

  it("evaluates the deduplicated entry (first copy wins)", () => {
    const dupNotWorkingFirst = [
      { num: "809-555-1234", funciona: false },
      { num: "8095551234", funciona: true },
    ];
    expect(
      validateContactedCall({
        phones: dupNotWorkingFirst,
        canalContacto: "WHATSAPP",
        telefonosExplicitEmpty: false,
      }),
    ).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
    expect(
      validateContactedCall({
        phones: [...dupNotWorkingFirst].reverse(),
        canalContacto: "WHATSAPP",
        telefonosExplicitEmpty: false,
      }),
    ).toBeNull();
  });

  it("rejects a missing channel", () => {
    for (const canalContacto of [null, undefined, "", "  "]) {
      expect(
        validateContactedCall({ phones: [ok], canalContacto, telefonosExplicitEmpty: false }),
      ).toBe(CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE);
    }
  });

  it("checks the phone before the channel", () => {
    expect(
      validateContactedCall({ phones: [], canalContacto: null, telefonosExplicitEmpty: false }),
    ).toBe(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE);
  });
});
