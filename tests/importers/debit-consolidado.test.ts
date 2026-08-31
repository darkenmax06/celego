import { describe, expect, it } from "vitest";
import { parseDebitConsolidadoImport } from "../../lib/importers/debit-consolidado";
import { CardStatus, CardProductType, DispatchOrigin } from "@prisma/client";
import * as XLSX from "xlsx";

describe("debit consolidado import parser", () => {
  it("parses DATA sheet rows with status normalization, phones, address, and remote flag", () => {
    const headers = [
      "FECH ASIG", "N-SS", "TIPO", "AREA", "SUBAREA", "ANALISTA_ASIGNADO",
      "NRO_ID", "CONTACTO", "NOMBRE_DE_OFICINA", "OFICIAL", "PROVMUNSEC",
      "DESCRIPCION_AMPLIADA", "PROVINCIA", "ESTADO", "DISTRITO_MUNICIPIAL",
      "SECTOR", "CALLE", "NUMERO", "EMPRESA_EDIFICIO", "DEPTO_APTO",
      "REFERENCIA", "TIPO_TEL_1", "TEL_1", "EXT_TEL_1", "TIPO_TEL_2",
      "TEL_2", "EXT_TEL_2", "TIPO_TEL_3", "TEL_3", "EXT_TEL_3",
      "CREADO_POR", "FECHA_CREACION", "ZONA", "STATUS", "COMENTARIO",
      "QUIEN RECIBE", "INFO TERCERO", "FECHA DE ENTREGA", "Comentario BPD",
      "AREAS REMOTAS", "Status Cc", "Contacto Cc", "No. Contact"
    ];

    const row1 = [
      46205, "4-13802824452", "Cuentas", "Solicitud de Servicios", "Entrega Tarjeta Debito", "U46603",
      "40212318824", "EMELY MELISSA PICHARDO CASTILLO", "OFICINA DOWNTOWN CENTER MALL", "U1234", "Santiago;Santiago;Arroyo hondo abajo",
      "Santiago-Desc", "SANTIAGO", "En proceso", "Santiago",
      "Arroyo hondo abajo", "Maria trinidad sanchez", "17", "Edif A", "Apt 1",
      "AL LADO DE COLMADO", "C", "8297523579", "0", "T",
      "8494288039", "0", "0", "0", "0",
      "APPPOPULAR", 46204.5, "En proceso", "TD- ENTREGADO", "Entregado a cliente",
      "PRINCIPAL", "", 46209, "",
      "SI", "Contactos Efectivos", "Nota llamada", "8297523579"
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, row1]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DATA");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = parseDebitConsolidadoImport(buffer);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);

    const card = result.rows[0];
    expect(card.requestNumber).toBe("4-13802824452");
    expect(card.tc).toBe("4-13802824452");
    expect(card.cedula).toBe("40212318824");
    expect(card.nombre).toBe("EMELY MELISSA PICHARDO CASTILLO");
    expect(card.provincia).toBe("SANTIAGO");
    expect(card.zona).toBe("Norte");
    expect(card.status).toBe(CardStatus.TD_ENTREGADO);
    expect(card.productType).toBe(CardProductType.DEBITO);
    expect(card.dispatchOrigin).toBe(DispatchOrigin.BPD_DEBITO);
    expect(card.isRemote).toBe(true);
    expect(card.comment).toBe("Entregado a cliente");
    expect(card.recipientName).toBe("PRINCIPAL");
  });

  it("handles trailing spaces in status and missing optional fields gracefully", () => {
    const headers = ["N-SS", "NRO_ID", "CONTACTO", "PROVINCIA", "STATUS"];
    const row1 = ["4-99999999999", "00100000000", "JUAN PEREZ", "Santo Domingo", "EN RUTA "];
    const row2 = ["4-88888888888", "00100000001", "MARIA GOMEZ", "Higuey", "TD- DEVUELTO NO LOCALIZADO"];

    const ws = XLSX.utils.aoa_to_sheet([headers, row1, row2]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DATA");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = parseDebitConsolidadoImport(buffer);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].status).toBe(CardStatus.EN_RUTA);
    expect(result.rows[1].status).toBe(CardStatus.TD_DEVUELTO_NO_LOCALIZADO);
    expect(result.rows[1].zona).toBe("Este");
  });
});
