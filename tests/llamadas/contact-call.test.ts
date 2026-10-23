import { describe, expect, it } from "vitest";
import { CardProductType, CardStatus } from "@prisma/client";
import {
  NO_CONTACT_PHONE_DETAIL_MESSAGE,
  NO_CONTACT_PHONES_REQUIRED_MESSAGE,
  resolveContactResultado,
  resolveReturnStatus,
  validateNoContactPhones,
} from "@/lib/contact-call";

describe("validateNoContactPhones", () => {
  it("requires at least one phone", () => {
    expect(validateNoContactPhones(undefined)).toBe(NO_CONTACT_PHONES_REQUIRED_MESSAGE);
    expect(validateNoContactPhones([])).toBe(NO_CONTACT_PHONES_REQUIRED_MESSAGE);
    expect(validateNoContactPhones([{ numero: "  ", estado: "APAGADO" }])).toBe(
      NO_CONTACT_PHONES_REQUIRED_MESSAGE,
    );
  });

  it("rejects when any phone has neither estado nor nota", () => {
    expect(
      validateNoContactPhones([
        { numero: "8095551111", estado: "NO_CONTESTA" },
        { numero: "8095552222", estado: null, nota: "   " },
      ]),
    ).toBe(NO_CONTACT_PHONE_DETAIL_MESSAGE);
  });

  it("accepts phones with an estado or a nota", () => {
    expect(
      validateNoContactPhones([
        { numero: "8095551111", estado: "APAGADO" },
        { numero: "8095552222", nota: "Dice que no lo conoce" },
      ]),
    ).toBeNull();
  });
});

describe("resolveContactResultado", () => {
  it("prioritises return, then transfer, then contactado", () => {
    expect(resolveContactResultado({ contactado: true, solicitudRetorno: true, traslado: true })).toBe(
      "RETORNO_SOLICITADO",
    );
    expect(resolveContactResultado({ contactado: false, traslado: true })).toBe("TRASLADO_SOLICITADO");
    expect(resolveContactResultado({ contactado: true })).toBe("CONTACTADA");
    expect(resolveContactResultado({ contactado: false })).toBe("NO_CONTACTADA");
  });
});

describe("resolveReturnStatus", () => {
  it("maps credit cards to EN_PROCESO_DE_RETORNO", () => {
    expect(resolveReturnStatus(CardProductType.CREDITO, CardStatus.EN_RUTA)).toBe(
      CardStatus.EN_PROCESO_DE_RETORNO,
    );
  });

  it("maps debit cards to TD_EN_PROCESO_DE_RETORNO", () => {
    expect(resolveReturnStatus(CardProductType.DEBITO, CardStatus.DESPACHADA)).toBe(
      CardStatus.TD_EN_PROCESO_DE_RETORNO,
    );
  });

  it("skips closed/delivered cards and cards already returning", () => {
    expect(resolveReturnStatus(CardProductType.CREDITO, CardStatus.ENTREGADA)).toBeNull();
    expect(resolveReturnStatus(CardProductType.CREDITO, CardStatus.ENTREGA_SIN_CONTRATO)).toBeNull();
    expect(resolveReturnStatus(CardProductType.DEBITO, CardStatus.TD_ENTREGADO)).toBeNull();
    expect(resolveReturnStatus(CardProductType.CREDITO, CardStatus.EN_PROCESO_DE_RETORNO)).toBeNull();
    expect(resolveReturnStatus(CardProductType.DEBITO, CardStatus.TD_EN_PROCESO_DE_RETORNO)).toBeNull();
  });
});
