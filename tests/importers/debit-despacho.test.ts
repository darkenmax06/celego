import { describe, expect, it } from "vitest";
import { parseDebitDespachoImport } from "../../lib/importers/debit-despacho";
import { CardStatus, CardProductType, DispatchOrigin } from "@prisma/client";
import * as XLSX from "xlsx";

describe("debit despacho import parser", () => {
  it("parses CELE sheet with default DESPACHADA status and extracts address/phones", () => {
    const headers = [
      "NRO_SS", "TIPO", "AREA", "SUBAREA", "ANALISTA_ASIGNADO",
      "NRO_ID", "CONTACTO", "NOMBRE_DE_OFICINA", "OFICIAL", "PROVMUNSEC",
      "DESCRIPCION_AMPLIADA", "PROVINCIA", "MUNICIPIO", "DISTRITO_MUNICIPIAL",
      "SECTOR", "CALLE", "NUMERO", "EMPRESA_EDIFICIO", "DEPTO_APTO",
      "REFERENCIA", "TIPO_TEL_1", "TEL_1", "EXT_TEL_1", "TIPO_TEL_2",
      "TEL_2", "EXT_TEL_2", "TIPO_TEL_3", "TEL_3", "EXT_TEL_3",
      "CREADO_POR", "FECHA_CREACION", "ESTADO", "NOTA"
    ];

    const row1 = [
      "4-14061365072", "Cuentas", "Solicitud de Servicios", "Entrega Tarjeta Debito", "U52123",
      "40233316138", "CARLOS MIGUEL RIJO CASTILLO", "221-SUCURSAL HIGUEY", "U41118", "La Altagracia;Higuey",
      "Higuanama 3", "LA ALTAGRACIA", "HIGUEY", "HIGUEY",
      "Los soto arriba", "higuanama", "3", "Agrofem", "1",
      "Agrofem", "C", "8095044590", "0", "C",
      "8096623841", "0", "0", "0", "0",
      "APPPOPULAR", 46254.5, "En proceso", "CELE"
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, row1]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CELE");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = parseDebitDespachoImport(buffer);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);

    const card = result.rows[0];
    expect(card.requestNumber).toBe("4-14061365072");
    expect(card.cedula).toBe("40233316138");
    expect(card.nombre).toBe("CARLOS MIGUEL RIJO CASTILLO");
    expect(card.provincia).toBe("LA ALTAGRACIA");
    expect(card.zona).toBe("Este");
    expect(card.status).toBe(CardStatus.DESPACHADA);
    expect(card.productType).toBe(CardProductType.DEBITO);
    expect(card.dispatchOrigin).toBe(DispatchOrigin.BPD_DEBITO);
    expect(card.telefonosRaw).toContain("8095044590");
    expect(card.telefonosRaw).toContain("8096623841");
  });
});
