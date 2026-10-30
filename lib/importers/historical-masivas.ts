import Papa from "papaparse";
import { normalizeCustomerId } from "../customer-id";
import { buildSourceRecordKey, type DispatchOrigin } from "../dispatch-origin";

/** Label shared by every batch, card metadata entry and audit row of this import. */
export const HISTORICAL_BATCH_LABEL = "HISTORICO_MASIVAS_2024_2025";

export type HistoricalStatus = "ENTREGADA" | "RETORNADA" | "ENTREGA_DIGITAL";

/**
 * Final status per monthly-close status. EN_PROCESO_DE_RETORNO is closed as
 * RETORNADA: live operativo, call and route lists treat it as open, and a
 * historical card must never show up there.
 */
const STATUS_MAP: Record<string, HistoricalStatus> = {
  ENTREGADA: "ENTREGADA",
  RETORNADA: "RETORNADA",
  ENTREGA_DIGITAL: "ENTREGA_DIGITAL",
  EN_PROCESO_DE_RETORNO: "RETORNADA",
};
const ORIGINS: DispatchOrigin[] = ["TORRE_POPULAR", "CENTRO_ACOPIO"];

export type HistoricalCsvRow = Record<string, string>;

export type HistoricalMetadata = {
  historical: {
    batchLabel: string;
    period: string;
    sourceFile: string;
    sourceRow: number;
    messenger: string | null;
    comment: string | null;
    statusRaw: string;
    originInferred: boolean;
    warnings: string[];
  };
};

export type HistoricalCard = {
  line: number;
  tc: string;
  cedula: string;
  nombre: string;
  zona: string;
  provincia: string | null;
  dispatchDate: Date;
  status: HistoricalStatus;
  origin: DispatchOrigin;
  isRemote: boolean;
  sourceRecordKey: string;
  metadata: HistoricalMetadata;
};

export type HistoricalRejection = { line: number; code: string; message: string; tcLast4: string };

/** Parses the extractor CSV (UTF-8, optional BOM, RFC 4180 quoting) into header-keyed rows. */
export function parseHistoricalCsv(content: string): HistoricalCsvRow[] {
  const parsed = Papa.parse<HistoricalCsvRow>(content.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (value) => value.trim(),
  });
  return parsed.data;
}

function bool(value: string | undefined) {
  return /^(true|1|si|s)$/i.test((value ?? "").trim());
}

function nonEmpty(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function isoDate(value: string | undefined) {
  const match = (value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function maskTc(tc: string | undefined) {
  const digits = (tc ?? "").replace(/\D/g, "");
  return digits ? `****${digits.slice(-4)}` : "";
}

/**
 * Validates every row, drops in-file duplicates by source record key and
 * returns the cards in dispatch order (ties keep file order), so that the
 * last delivery of a re-shipped TC is also the last one processed.
 */
export function buildHistoricalCards(rows: HistoricalCsvRow[]) {
  const cards: HistoricalCard[] = [];
  const rejected: HistoricalRejection[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const tcLast4 = maskTc(row.tc);
    const reject = (code: string, message: string) => rejected.push({ line, code, message, tcLast4 });

    if (nonEmpty(row.problems)) return reject("SOURCE_PROBLEM", `Fila con problemas de origen: ${row.problems}`);
    const tc = (row.tc ?? "").replace(/\D/g, "");
    if (!/^\d{15,19}$/.test(tc) || /^0+$/.test(tc)) return reject("INVALID_TC", "TC invalida: debe tener entre 15 y 19 digitos");
    const cedula = normalizeCustomerId(row.cedula ?? "");
    if (!cedula) return reject("INVALID_CEDULA", "Cedula invalida");
    const nombre = nonEmpty(row.nombre);
    if (!nombre) return reject("EMPTY_NAME", "Nombre vacio");
    const dispatchDate = isoDate(row.dispatch_date);
    if (!dispatchDate) return reject("INVALID_DATE", `Fecha invalida: ${row.dispatch_date || "vacia"}`);
    const status = STATUS_MAP[(row.status ?? "").trim()];
    if (!status) return reject("UNKNOWN_STATUS", `Estado no soportado: ${row.status || "vacio"}`);
    const origin = ORIGINS.find((item) => item === (row.dispatch_origin ?? "").trim());
    if (!origin) return reject("UNKNOWN_ORIGIN", `Procedencia no soportada: ${row.dispatch_origin || "vacia"}`);
    const zona = nonEmpty(row.zona);
    if (!zona) return reject("EMPTY_ZONE", "Zona vacia");

    const sourceRecordKey = buildSourceRecordKey({ origin, tc, cedula, dispatchDate });
    const firstLine = seen.get(sourceRecordKey);
    if (firstLine !== undefined) {
      return reject("DUPLICATE_SOURCE_RECORD", `Fila duplicada: misma TC, cedula y fecha que la linea ${firstLine}`);
    }
    seen.set(sourceRecordKey, line);

    cards.push({
      line,
      tc,
      cedula,
      nombre,
      zona,
      provincia: nonEmpty(row.provincia),
      dispatchDate,
      status,
      origin,
      isRemote: bool(row.is_remote),
      sourceRecordKey,
      metadata: {
        historical: {
          batchLabel: HISTORICAL_BATCH_LABEL,
          period: (row.period ?? "").trim(),
          sourceFile: (row.source_file ?? "").trim(),
          sourceRow: Number(row.source_row) || 0,
          messenger: nonEmpty(row.messenger),
          comment: nonEmpty(row.comment),
          statusRaw: (row.status_raw ?? "").trim(),
          originInferred: bool(row.origin_inferred),
          warnings: (row.warnings ?? "").split(";").map((item) => item.trim()).filter(Boolean),
        },
      },
    });
  });

  cards.sort((a, b) => a.dispatchDate.getTime() - b.dispatchDate.getTime() || a.line - b.line);
  return { cards, rejected };
}

/**
 * Source record key of the card that should end as `deliveredCardId` for each
 * TC: its chronologically last ENTREGADA. TCs never delivered are absent, and
 * `activeCardId` is never planned because no historical card is open.
 */
export function planDeliveredGuards(cards: HistoricalCard[]) {
  const plan = new Map<string, string>();
  for (const card of cards) {
    if (card.status === "ENTREGADA") plan.set(card.tc, card.sourceRecordKey);
  }
  return plan;
}
