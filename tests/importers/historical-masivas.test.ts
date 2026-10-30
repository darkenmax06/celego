import { describe, expect, it } from "vitest";
import {
  buildHistoricalCards,
  HISTORICAL_BATCH_LABEL,
  parseHistoricalCsv,
  planDeliveredGuards,
  type HistoricalCsvRow,
} from "../../lib/importers/historical-masivas";

const TC = "4921012270793854";

function row(overrides: Partial<HistoricalCsvRow> = {}): HistoricalCsvRow {
  return {
    period: "2025-03",
    dispatch_date: "2025-03-03",
    tc: TC,
    tc_kind: "FULL",
    cedula: "40232284956",
    nombre: "YAHIR ROSARIO",
    zona: "Este",
    provincia: "La Romana",
    status: "ENTREGADA",
    status_raw: "ENTREGADA",
    dispatch_origin: "TORRE_POPULAR",
    origin_inferred: "False",
    is_additional: "False",
    is_remote: "True",
    messenger: "",
    comment: "",
    source_file: "REPORTE.xlsx",
    source_row: "12",
    problems: "",
    warnings: "",
    ...overrides,
  };
}

describe("parseHistoricalCsv", () => {
  it("strips the BOM and honors quoted commas and quotes", () => {
    const csv = '﻿period,nombre,comment\r\n2025-03,"PEREZ, ANA","dijo ""no"""\r\n';
    expect(parseHistoricalCsv(csv)).toEqual([{ period: "2025-03", nombre: "PEREZ, ANA", comment: 'dijo "no"' }]);
  });
});

describe("buildHistoricalCards", () => {
  it("keeps final statuses and closes EN_PROCESO_DE_RETORNO as RETORNADA", () => {
    const { cards } = buildHistoricalCards([
      row({ status: "ENTREGADA" }),
      row({ status: "RETORNADA", tc: "5188011367524365" }),
      row({ status: "ENTREGA_DIGITAL", tc: "5188011367524366" }),
      row({ status: "EN_PROCESO_DE_RETORNO", tc: "5188011367524367" }),
    ]);
    expect(cards.map((card) => card.status)).toEqual(["ENTREGADA", "RETORNADA", "ENTREGA_DIGITAL", "RETORNADA"]);
  });

  it("rejects source problems, bad identifiers, dates and statuses without exposing the PAN", () => {
    const { cards, rejected } = buildHistoricalCards([
      row({ problems: "TC_TERMINAL_ONLY" }),
      row({ tc: "9416" }),
      row({ cedula: "12" }),
      row({ dispatch_date: "2025-02-31" }),
      row({ status: "PERDIDA" }),
    ]);
    expect(cards).toHaveLength(0);
    expect(rejected.map((item) => item.code)).toEqual(["SOURCE_PROBLEM", "INVALID_TC", "INVALID_CEDULA", "INVALID_DATE", "UNKNOWN_STATUS"]);
    expect(rejected[0].tcLast4).toBe("****3854");
    expect(JSON.stringify(rejected)).not.toContain(TC);
  });

  it("drops a second row with the same source record key", () => {
    const { cards, rejected } = buildHistoricalCards([row(), row({ status: "RETORNADA" })]);
    expect(cards).toHaveLength(1);
    expect(rejected).toEqual([expect.objectContaining({ line: 3, code: "DUPLICATE_SOURCE_RECORD" })]);
  });

  it("builds the historical metadata block", () => {
    const { cards } = buildHistoricalCards([
      row({ messenger: "WANDER", comment: "NO LOCALIZADO", origin_inferred: "True", warnings: "ORIGIN_INFERRED;PROVINCIA_MISSING" }),
    ]);
    expect(cards[0].metadata).toEqual({
      historical: {
        batchLabel: HISTORICAL_BATCH_LABEL,
        period: "2025-03",
        sourceFile: "REPORTE.xlsx",
        sourceRow: 12,
        messenger: "WANDER",
        comment: "NO LOCALIZADO",
        statusRaw: "ENTREGADA",
        originInferred: true,
        warnings: ["ORIGIN_INFERRED", "PROVINCIA_MISSING"],
      },
    });
    expect(cards[0].isRemote).toBe(true);
    expect(cards[0].sourceRecordKey).toBe(`TORRE_POPULAR|${TC}|40232284956|2025-03-03`);
  });
});

describe("planDeliveredGuards", () => {
  it("points each TC at its chronologically last delivery, whatever the file order", () => {
    const { cards } = buildHistoricalCards([
      row({ dispatch_date: "2025-05-02", status: "ENTREGADA" }),
      row({ dispatch_date: "2025-01-10", status: "ENTREGADA" }),
      row({ dispatch_date: "2025-06-01", status: "RETORNADA" }),
      row({ tc: "5188011367524365", status: "RETORNADA" }),
    ]);
    const plan = planDeliveredGuards(cards);
    expect(plan.size).toBe(1);
    expect(plan.get(TC)).toBe(`TORRE_POPULAR|${TC}|40232284956|2025-05-02`);
  });
});
