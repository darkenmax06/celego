import * as XLSX from "xlsx";
import { format } from "date-fns";

export type DebitPinitExportCard = {
  requestNumber: string;
  nombre: string;
  cedula: string;
  provincia: string;
  zona: string;
  direccionRaw: string;
  telefonosRaw: string;
  dispatchDate?: Date | null;
  metadata?: Record<string, unknown> | null;
};

const PINIT_HEADERS = [
  "Cliente Primario[*]",
  "Método de entrega[*]",
  "Opción de entrega[*]",
  "Fecha inicial entrega[*]",
  "Fecha final entrega",
  "Nombre(s) del cliente[*]",
  "Apellidos del cliente[*]",
  "Teléfono",
  "Celular[*]",
  "Email[*]",
  "Código postal[*]",
  "Colonia",
  "Calle[*]",
  "Entre Calle 1",
  "Entre Calle 2",
  "No. Exterior[*]",
  "No. interior",
  "Referencia",
  "Estado[*]",
  "País[*]",
  "Latitud",
  "Longitud",
  "No. de orden[*]",
  "COD",
  "Peso[*]",
  "Ancho[*]",
  "Alto[*]",
  "Profundidad[*]",
  "Tracking number alternativo",
  "Almacen destino",
  "Cliente secundario",
  "SKU",
  "Valor del producto",
  "Valor asegurado",
  "Impuestos",
  "Descripcion",
  "Items",
  "Peligroso",
  "Clave SAT",
  "Descripcion SAT",
  "Clave material peligroso",
  "Id de ubicación",
  "Nombre de ubicación",
  "Tipo de ubicación",
  "Pickup Nombres Del Cliente",
  "Pickup código postal",
];

function splitFullName(fullName: string): { firstNames: string; lastNames: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { firstNames: parts[0] || "CLIENTE", lastNames: "BPD" };
  }
  if (parts.length === 2) {
    return { firstNames: parts[0], lastNames: parts[1] };
  }
  if (parts.length === 3) {
    return { firstNames: `${parts[0]} ${parts[1]}`, lastNames: parts[2] };
  }
  // 4 or more
  const mid = Math.ceil(parts.length / 2);
  return {
    firstNames: parts.slice(0, mid).join(" "),
    lastNames: parts.slice(mid).join(" "),
  };
}

function parsePhones(phonesRaw: string): { tel: string; cel: string } {
  const phones = (phonesRaw || "")
    .split("|")
    .map((p) => p.replace(/\D/g, "").trim())
    .filter((p) => p.length >= 7);

  const tel = phones[0] || "8090000000";
  const cel = phones[1] || phones[0] || "8290000000";
  return { tel, cel };
}

export function generateDebitPinitExcel(cards: DebitPinitExportCard[], dispatchDate = new Date()): Buffer {
  const formattedDate = format(dispatchDate, "dd/MM/yyyy");

  const rows: (string | number | null)[][] = [PINIT_HEADERS];

  for (const card of cards) {
    const meta = (card.metadata ?? {}) as Record<string, string>;
    const { firstNames, lastNames } = splitFullName(card.nombre);
    const { tel, cel } = parsePhones(card.telefonosRaw);

    const isMetro =
      card.zona.toUpperCase() === "METRO" ||
      card.provincia.toUpperCase().includes("SANTO DOMINGO") ||
      card.provincia.toUpperCase().includes("DISTRITO NACIONAL");

    const postalCode = isMetro ? "11111" : "22222";
    const estado = isMetro ? "Ciudad" : "Interior";
    const colonia = meta.sector || card.provincia || "DISTRITO NACIONAL";
    const calle = [meta.calle, meta.numero ? `No. ${meta.numero}` : "", meta.sector].filter(Boolean).join(" ") || card.direccionRaw || "Direccion";
    const noExterior = meta.numero || "0";
    const noInterior = meta.depto || "0";
    const referencia = meta.referencia || "0";

    const row = [
      "BPD DEBITO- Celeritas", // Cliente Primario[*]
      "VAN",                   // Método de entrega[*]
      "cero a cinco dias",     // Opción de entrega[*]
      formattedDate,           // Fecha inicial entrega[*]
      "",                      // Fecha final entrega
      firstNames,              // Nombre(s) del cliente[*]
      lastNames,               // Apellidos del cliente[*]
      tel,                     // Teléfono
      cel,                     // Celular[*]
      "rdecolombia1@mbe.com.do", // Email[*]
      postalCode,              // Código postal[*]
      colonia,                 // Colonia
      calle,                   // Calle[*]
      "",                      // Entre Calle 1
      "",                      // Entre Calle 2
      noExterior,              // No. Exterior[*]
      noInterior,              // No. interior
      referencia,              // Referencia
      estado,                  // Estado[*]
      "República Dominicana",  // País[*]
      "",                      // Latitud
      "",                      // Longitud
      card.requestNumber,      // No. de orden[*]
      "",                      // COD
      1,                       // Peso[*]
      1,                       // Ancho[*]
      1,                       // Alto[*]
      1,                       // Profundidad[*]
      "",                      // Tracking number alternativo
      "",                      // Almacen destino
      "",                      // Cliente secundario
      "",                      // SKU
      "",                      // Valor del producto
      "",                      // Valor asegurado
      "",                      // Impuestos
      "Tarjeta de debito",     // Descripcion
      1,                       // Items
      "",                      // Peligroso
      "",                      // Clave SAT
      "",                      // Descripcion SAT
      "",                      // Clave material peligroso
      "",                      // Id de ubicación
      "",                      // Nombre de ubicación
      "",                      // Tipo de ubicación
      "",                      // Pickup Nombres Del Cliente
      "",                      // Pickup código postal
    ];

    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
