import { describe, expect, it } from "vitest";
import {
  buildCardExportRows,
  cardSelectionExportSchema,
  MAX_CARD_EXPORT_SELECTION,
  type ExportableCard,
} from "@/lib/card-selection-export";

const card: ExportableCard = {
  tc: "4111",
  requestNumber: null,
  externalReference: "REF-1",
  productType: "CREDITO",
  status: "EN_RUTA",
  provincia: "Santiago",
  zona: "Norte",
  isRemote: true,
  isAdditional: true,
  additionalIndex: 2,
  urgent: false,
  dispatchOrigin: "CENTRO_ACOPIO",
  returnReason: null,
  customer: { nombre: "Ana Perez", cedula: "001", telefonosRaw: null, direccionRaw: "Calle 1" },
  currentMessenger: { nombre: "Luis" },
  dispatchDate: new Date(2026, 7, 5, 12, 0),
  slaDueDate: null,
  createdAt: new Date(2026, 7, 1, 9, 30),
  metadata: { operativo: { fechaPreferenciaEntrega: "2026-08-20" } },
};

describe("buildCardExportRows", () => {
  it("emits the requested fields in catalog order with Spanish labels", () => {
    const [row] = buildCardExportRows([card], ["mensajero", "tc", "tipo", "remota", "origen"]);
    expect(Object.keys(row)).toEqual(["TC", "Remota", "Tipo", "Origen", "Mensajero"]);
    expect(row).toEqual({
      TC: "4111",
      Remota: "SI",
      Tipo: "ADICIONAL 2",
      Origen: "Centro de acopio",
      Mensajero: "Luis",
    });
  });

  it("formats date fields and leaves missing dates empty", () => {
    const [row] = buildCardExportRows(
      [card],
      ["dispatchDate", "slaDueDate", "createdAt", "fechaPreferenciaEntrega"],
    );
    expect(row).toEqual({
      "Fecha de despacho": "05/08/2026",
      "Vencimiento SLA": "",
      "Preferencia de entrega": "20/08/2026",
      "Fecha de creación": "01/08/2026 09:30",
    });
  });
});

describe("cardSelectionExportSchema", () => {
  const valid = { cardIds: ["c1"], fields: ["tc"], format: "xlsx" };

  it("accepts a valid request", () => {
    expect(cardSelectionExportSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects fields outside the whitelist", () => {
    expect(cardSelectionExportSchema.safeParse({ ...valid, fields: ["passwordHash"] }).success).toBe(false);
  });

  it("rejects unsupported formats, empty selections and oversized selections", () => {
    expect(cardSelectionExportSchema.safeParse({ ...valid, format: "pdf" }).success).toBe(false);
    expect(cardSelectionExportSchema.safeParse({ ...valid, cardIds: [] }).success).toBe(false);
    expect(
      cardSelectionExportSchema.safeParse({
        ...valid,
        cardIds: Array.from({ length: MAX_CARD_EXPORT_SELECTION + 1 }, (_, i) => `c${i}`),
      }).success,
    ).toBe(false);
  });
});
