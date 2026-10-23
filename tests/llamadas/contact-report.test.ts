import { describe, expect, it } from "vitest";
import {
  buildContactReportMessage,
  buildContactReportRow,
  NO_DELIVERY_DATE_TEXT,
  type ContactReportSource,
} from "@/lib/contact-report";

const base: ContactReportSource = {
  createdAt: new Date(2026, 9, 15, 10, 0),
  operador: "Operador Uno",
  tc: "4321",
  cliente: "Ana Gómez",
  cedula: "001",
  productType: "CREDITO",
  provincia: "Santo Domingo",
  zona: "Metro",
  cardDireccion: "Calle Vieja 1",
  nuevaDireccion: null,
  telefonosDetalle: null,
  telefonosUsados: null,
  telefonoPrincipal: "8095550001",
  canalContacto: null,
  fechaPreferenciaEntrega: null,
  mensajero: null,
  mensajeroTelefono: null,
  resultado: "CONTACTADA",
  comentario: null,
};

describe("buildContactReportMessage", () => {
  it("uses fallbacks: card address, principal phone, no specific date", () => {
    expect(buildContactReportMessage(base)).toBe(
      [
        "Cliente: Ana Gómez",
        "TC: 4321",
        "Dirección: Calle Vieja 1",
        "Número de contacto: 8095550001",
        "Canal: No especificado",
        `Fecha de entrega: ${NO_DELIVERY_DATE_TEXT}`,
        "Mensajero: Sin asignar",
      ].join("\n"),
    );
  });

  it("prefers collected address, answered phone, channel and date", () => {
    const message = buildContactReportMessage({
      ...base,
      nuevaDireccion: "Av. Nueva 9",
      telefonosDetalle: [
        { numero: "8095559999", estado: "NO_CONTESTA" },
        { numero: "8295558888", estado: "CONTESTA" },
      ],
      telefonosUsados: "8095559999",
      canalContacto: "LLAMADA_DIRECTA",
      fechaPreferenciaEntrega: "2026-10-20",
      mensajero: "Pedro",
      mensajeroTelefono: "8095550000",
    });
    expect(message).toContain("Dirección: Av. Nueva 9");
    expect(message).toContain("Número de contacto: 8295558888");
    expect(message).toContain("Canal: Llamada directa");
    expect(message).toContain("Fecha de entrega: 20/10/2026");
    expect(message).toContain("Mensajero: Pedro (8095550000)");
  });

  it("falls back to the first used phone when none answered", () => {
    expect(
      buildContactReportMessage({
        ...base,
        telefonosUsados: "8091112222, 8093334444",
        canalContacto: "WHATSAPP",
      }),
    ).toContain("Número de contacto: 8091112222\nCanal: WhatsApp");
  });
});

describe("buildContactReportRow", () => {
  it("emits the report columns in contract order with the message last", () => {
    const row = buildContactReportRow(base);
    expect(Object.keys(row)).toEqual([
      "Fecha gestión",
      "Operador",
      "TC",
      "Cliente",
      "Cédula",
      "Tipo tarjeta",
      "Provincia",
      "Zona",
      "Dirección recopilada",
      "Teléfono de contacto",
      "Canal",
      "Fecha de entrega",
      "Mensajero",
      "Teléfono mensajero",
      "Resultado",
      "Comentario",
      "Mensaje",
    ]);
    expect(row["Tipo tarjeta"]).toBe("Crédito");
    expect(row.Resultado).toBe("Contactada");
    expect(row["Fecha de entrega"]).toBe(NO_DELIVERY_DATE_TEXT);
  });
});
