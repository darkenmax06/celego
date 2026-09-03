import { describe, expect, it } from "vitest";
import { CardStatus } from "@prisma/client";
import { toCardStatus } from "@/lib/card-status";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 1, task 1.2/1.8.
 *
 * Adds normalization aliases for the new `EN_PROCESO_DE_RETORNO` status.
 */
describe("toCardStatus — EN_PROCESO_DE_RETORNO aliases", () => {
  it("maps the exact enum spelling", () => {
    expect(toCardStatus("EN_PROCESO_DE_RETORNO")).toBe(CardStatus.EN_PROCESO_DE_RETORNO);
  });

  it("maps the no-underscore alias", () => {
    expect(toCardStatus("ENPROCESODERETORNO")).toBe(CardStatus.EN_PROCESO_DE_RETORNO);
  });

  it("maps the human-readable spaced alias", () => {
    expect(toCardStatus("EN PROCESO DE RETORNO")).toBe(CardStatus.EN_PROCESO_DE_RETORNO);
  });

  it("still falls back to DESPACHADA for an unrecognized value (approval — existing behavior)", () => {
    expect(toCardStatus("VALOR_DESCONOCIDO")).toBe(CardStatus.DESPACHADA);
  });
});
