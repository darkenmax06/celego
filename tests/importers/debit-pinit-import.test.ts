import { describe, expect, it } from "vitest";
import { parseDebitPinitImport } from "../../lib/importers/debit-pinit-import";
import { mapPinitExportStatus } from "../../lib/debit-status";
import { CardStatus } from "@prisma/client";
import * as XLSX from "xlsx";

describe("debit pinit export parser", () => {
  it("maps Pinit status strings correctly", () => {
    expect(mapPinitExportStatus("360 - Entregado al cliente")).toBe(CardStatus.TD_ENTREGADO);
    expect(mapPinitExportStatus("303 - En transito para entrega")).toBe(CardStatus.EN_RUTA);
    expect(mapPinitExportStatus("311 - Cliente no disponible (DND)")).toBe(CardStatus.NO_LOCALIZADO);
    expect(mapPinitExportStatus("318 - Rechazado por el cliente")).toBe(CardStatus.NO_LOCALIZADO);
    expect(mapPinitExportStatus("310 - Intentados no entregados")).toBe(CardStatus.NO_LOCALIZADO);
    expect(mapPinitExportStatus("207 - En espera para salir de nuevo a ruta")).toBe(CardStatus.NO_LOCALIZADO);
    expect(mapPinitExportStatus("109 - primer contacto de agendamiento")).toBe(CardStatus.DESPACHADA);
    expect(mapPinitExportStatus("101 - Envio Creado")).toBe(CardStatus.DESPACHADA);
  });

  it("only treats Pinit 123, 213, 420 and 335 as returns", () => {
    expect(mapPinitExportStatus("123 - Retornado / Devuelto a origen")).toBe(CardStatus.TD_DEVUELTO_NO_LOCALIZADO);
    expect(mapPinitExportStatus("RETORNADO / DEVUELTO A ORIGEN")).toBe(CardStatus.TD_DEVUELTO_NO_LOCALIZADO);
    expect(mapPinitExportStatus("213 - Datos incorrectos")).toBe(CardStatus.TD_DEVUELTO_NO_LOCALIZADO);
    expect(mapPinitExportStatus("420 - Cancelado / Orden anulada")).toBe(CardStatus.TD_DEVUELTO_NO_LOCALIZADO);
    expect(mapPinitExportStatus("335 - Zona de NO cobertura")).toBe(CardStatus.TD_ZONA_FUERA_COBERTURA);
    expect(mapPinitExportStatus("319 - Fuera de cobertura")).toBe(CardStatus.NO_LOCALIZADO);
    expect(mapPinitExportStatus("220 - Cancelado")).toBe(CardStatus.DESPACHADA);
  });

  it("resolves statuses that arrive as text without a code", () => {
    expect(mapPinitExportStatus("ENTREGADO AL CLIENTE")).toBe(CardStatus.TD_ENTREGADO);
    expect(mapPinitExportStatus("ENVIO CREADO")).toBe(CardStatus.DESPACHADA);
    expect(mapPinitExportStatus("DATOS INCORRECTOS")).toBe(CardStatus.TD_DEVUELTO_NO_LOCALIZADO);
    expect(mapPinitExportStatus("ZONA DE NO COBERTURA")).toBe(CardStatus.TD_ZONA_FUERA_COBERTURA);
    expect(mapPinitExportStatus("Entregado - Media milla")).toBe(CardStatus.DESPACHADA);
    expect(mapPinitExportStatus("Estado desconocido")).toBeNull();
  });

  it("parses Pinit Excel export workbook", () => {
    const headers = [
      "No. de orden", "Tracking number", "Cliente", "Telefono cliente",
      "Dirección cliente", "Fecha de entrega", "Estatus de la orden",
      "Nombre de quien recibe", "Usuario de último estatus", "# intentos", "Notas último intento"
    ];

    const row1 = [
      "4-13951976872", "BSDO913255265876", "CRYSTAL MARIE FAJARDO HERNANDEZ", "8099651055",
      "Casilda m, 24, Interior", 46235.4, "360 - Entregado al cliente",
      "CRYSTAL MARIE FAJARDO HERNANDEZ", "JORGE SANCHEZ DIAZ", 1, "Entregado conforme"
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, row1]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = parseDebitPinitImport(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].requestNumber).toBe("4-13951976872");
    expect(result.rows[0].trackingNumber).toBe("BSDO913255265876");
    expect(result.rows[0].mappedStatus).toBe(CardStatus.TD_ENTREGADO);
    expect(result.rows[0].recipientName).toBe("CRYSTAL MARIE FAJARDO HERNANDEZ");
    expect(result.rows[0].messengerName).toBe("JORGE SANCHEZ DIAZ");
  });

  it("parses the Pinit backup report, deduplicating and skipping invalid rows", () => {
    const attemptHeaders = [1, 2].flatMap((n) => [
      `Fecha de intento ${n}`, `Hora de intento ${n}`, `Email operador intento ${n}`,
      `Nombre operador intento ${n}`, `Entregado a (Intento ${n})`, `Motivo de retorno (Intento ${n})`,
    ]);
    const headers = [
      "Order Id", "Cliente primario", "Nombre(s) del cliente", "Celular", "No. de orden",
      "Tracking number", "Tracking number alternativo", "Fecha de eliminación",
      "Último estatus de ruta", "Estatus de la orden", ...attemptHeaders,
    ];
    const noAttempt = ["", "", "", "", "", ""];
    const rows = [
      // request number lives in "Tracking number alternativo" when "No. de orden" is the cedula
      ["100", "Celeritas - BPD TD", "ANA", "8090000001", "00116754557", "BSDO1", "4-14450572842", "No eliminada", "Entregado", "360 - Entregado al cliente",
        "2026-11-02", "09:00", "a@x.com", "PEDRO", "", "Número desconectado",
        "2026-11-03", "10:05", "b@x.com", "MARIO PEREZ", "ANA", ""],
      ["101", "Celeritas - BPD TD", "LUIS", "8090000002", "4-14617680952", "BSDO2", "", "No eliminada", "Nunca salió a ruta", "101 - Envio Creado", ...noAttempt, ...noAttempt],
      // newer order for the same request number wins
      ["105", "Celeritas - BPD TD", "LUIS", "8090000002", "4-14617680952", "BSDO3", "", "No eliminada", "Devuelto", "123 - Retornado / Devuelto a origen",
        "2026-11-04", "08:00", "c@x.com", "JUAN", "", "No localizado", ...noAttempt],
      ["106", "Celeritas - BPD TD", "X", "", "c", "", "", "No eliminada", "", "101 - Envio Creado", ...noAttempt, ...noAttempt],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const result = parseDebitPinitImport(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    expect(result.rows).toHaveLength(2);
    const [delivered, returned] = result.rows;
    expect(delivered.requestNumber).toBe("4-14450572842");
    expect(delivered.mappedStatus).toBe(CardStatus.TD_ENTREGADO);
    expect(delivered.attemptsCount).toBe(2);
    expect(delivered.messengerName).toBe("MARIO PEREZ");
    expect(delivered.recipientName).toBe("ANA");
    expect(delivered.deliveryDate?.getDate()).toBe(3);

    expect(returned.requestNumber).toBe("4-14617680952");
    expect(returned.trackingNumber).toBe("BSDO3");
    expect(returned.mappedStatus).toBe(CardStatus.TD_DEVUELTO_NO_LOCALIZADO);
    expect(returned.lastAttemptNotes).toBe("No localizado");
    expect(returned.deliveryDate).toBeNull();

    expect(result.errors.map((e) => e.row).sort()).toEqual([3, 5]);
  });
});
