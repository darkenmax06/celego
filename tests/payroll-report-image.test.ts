import { describe, expect, it } from "vitest";
import { buildMessengerReportSvg } from "../lib/payroll/report-image";

const rows = [
  { fecha: "2026-10-13T00:00:00Z", entregasNormales: 3, entregasRemotas: 1, recogidasBanco: 0, mandados: 0, totalCents: 50_000 },
  { fecha: "2026-10-13T00:00:00Z", note: "restantes tras el corte", entregasNormales: 2, entregasRemotas: 0, recogidasBanco: 0, mandados: 0, totalCents: 20_000 },
];

describe("messenger report image", () => {
  it("shows the day twice when it was cut, flagging the second line", () => {
    const svg = buildMessengerReportSvg({ messengerName: "Ana", from: "07/10/2026", to: "13/10/2026", rows });
    expect(svg.match(/13\/10\/2026/g)).toHaveLength(2);
    expect(svg).toContain("restantes tras el corte");
  });

  it("reads stored days in UTC so they never slip to the previous day", () => {
    const svg = buildMessengerReportSvg({ messengerName: "Ana", from: "a", to: "b", rows: [rows[0]] });
    expect(svg).toContain("13/10/2026");
    expect(svg).not.toContain("12/10/2026");
  });

  it("lists the loan installments and the net to pay on a period payment", () => {
    const svg = buildMessengerReportSvg({
      messengerName: "Ana",
      title: "Pago Quincena",
      from: "07/10/2026",
      to: "13/10/2026",
      rows,
      payment: { netCents: 40_000, deductions: [{ label: "Prestamo RD$5,000.00 - cuota 1/4", cents: 30_000 }] },
    });
    expect(svg).toContain("Pago Quincena");
    expect(svg).toContain("DESCUENTO DE PRESTAMOS");
    expect(svg).toContain("cuota 1/4");
    expect(svg).toContain("A PAGAR");
    expect(svg).toContain("RD$400.00");
  });

  it("keeps the plain range report unchanged when there is no payment", () => {
    const svg = buildMessengerReportSvg({ messengerName: "Ana", from: "a", to: "b", rows });
    expect(svg).toContain("TOTAL DEL PERIODO");
    expect(svg).not.toContain("DESCUENTO DE PRESTAMOS");
  });
});
