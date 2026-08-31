import { describe, expect, it } from "vitest";
import {
  parseUrgentCaseDetails,
  reclamacionDetailsSchema,
  solicitudDetailsSchema,
} from "@/lib/urgent-case-details";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 1, task 1.7/1.8.
 *
 * Zod schemas for `UrgentCase.details`, per case type (design D1). These
 * validate the type-specific fields kept in the JSON column; malformed
 * payloads must be rejected so a bad import row never silently corrupts an
 * open case's response export.
 */
describe("solicitudDetailsSchema", () => {
  it("accepts a valid solicitud payload", () => {
    const result = solicitudDetailsSchema.safeParse({
      destino: "SANTO DOMINGO",
      provinciaSolicitud: "DISTRITO NACIONAL",
      logActual: "EN PROCESO",
      cantidadDias: "3",
      fechaASuplidor: "2026-08-20",
      sourceRow: { TC: "4000", CEDULA: "001-0000000-0" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing the required destino field", () => {
    const result = solicitudDetailsSchema.safeParse({
      provinciaSolicitud: "DISTRITO NACIONAL",
      logActual: "EN PROCESO",
      cantidadDias: "3",
      sourceRow: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("reclamacionDetailsSchema", () => {
  it("accepts a valid reclamacion payload", () => {
    const result = reclamacionDetailsSchema.safeParse({
      nuevaDireccion: "Calle Principal #10",
      numero: "8091234567",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with a non-string nuevaDireccion", () => {
    const result = reclamacionDetailsSchema.safeParse({
      nuevaDireccion: 12345,
      numero: "8091234567",
    });
    expect(result.success).toBe(false);
  });
});

describe("parseUrgentCaseDetails", () => {
  it("parses a SOLICITUD payload using solicitudDetailsSchema", () => {
    const parsed = parseUrgentCaseDetails("SOLICITUD", {
      destino: "SANTIAGO",
      provinciaSolicitud: "SANTIAGO",
      logActual: "PENDIENTE",
      cantidadDias: "1",
      sourceRow: {},
    });
    expect(parsed.destino).toBe("SANTIAGO");
  });

  it("parses a RECLAMACION payload using reclamacionDetailsSchema", () => {
    const parsed = parseUrgentCaseDetails("RECLAMACION", {
      nuevaDireccion: "Av. 27 de Febrero",
      numero: "8095551212",
    });
    expect(parsed.nuevaDireccion).toBe("Av. 27 de Febrero");
  });

  it("throws for an invalid payload regardless of type", () => {
    expect(() => parseUrgentCaseDetails("SOLICITUD", { sourceRow: {} })).toThrow();
  });
});
