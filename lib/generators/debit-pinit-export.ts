import * as XLSX from "xlsx";

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
  // Pinit only accepts a real Excel date cell here, not text; local midnight keeps the calendar day.
  const deliveryDate = new Date(dispatchDate.getFullYear(), dispatchDate.getMonth(), dispatchDate.getDate());

  const rows: (string | number | Date | null)[][] = [PINIT_HEADERS];

  for (const card of cards) {
    const { firstNames, lastNames } = splitFullName(card.nombre);
    const { tel, cel } = parsePhones(card.telefonosRaw);

    const isMetro =
      card.zona.toUpperCase() === "METRO" ||
      card.provincia.toUpperCase().includes("SANTO DOMINGO") ||
      card.provincia.toUpperCase().includes("DISTRITO NACIONAL");

    const postalCode = isMetro ? "11111" : "22222";
    const estado = isMetro ? "Ciudad" : "Interior";
    const colonia = card.provincia || "Santo Domingo";
    // direccionRaw already holds "calle, No. x, sector, empresa, depto, Ref: y" from the dispatch import.
    const calle = card.direccionRaw || card.provincia || "Direccion";

    const row = [
      "Celeritas - BPD TD",    // Cliente Primario[*]
      "VAN",                   // Método de entrega[*]
      "cero a cinco dias",     // Opción de entrega[*]
      deliveryDate,            // Fecha inicial entrega[*]
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
      1,                       // No. Exterior[*]
      "0",                     // No. interior
      "0",                     // Referencia
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
