import { CardStatus } from "@prisma/client";

/**
 * Full Pinit TMS order-log status catalog (mbe.pinittms.com, "Código" select),
 * captured 2026-11-14. Labels are kept verbatim so a raw status that arrives
 * without its numeric code can still be resolved by text.
 */
export const PINIT_STATUS_CATALOG: Readonly<Record<number, string>> = {
  101: "Envio Creado",
  102: "Recoleccion solicitada",
  103: "Envio Recolectado",
  104: "Recoleccion en transito",
  105: "Salida del line haul a próxima parada",
  106: "Entre estaciones",
  107: "En ruta entre estaciones",
  108: "Disponible para recolectar",
  109: "primer contacto de agendamiento",
  110: "segundo intento de agendamiento",
  111: "tercer intento de agendamiento",
  112: "Auditoria Preventiva",
  115: "Guía no llegó",
  120: "Retorno Solicitado",
  121: "Entre estación de Media Milla - Retorno",
  122: "Recibido en Almacén Última milla - Retorno",
  123: "Retornado / Devuelto a origen",
  124: "Disponible para centro de distribución - Retorno",
  125: "Paquete con DMA",
  126: "Envío documentado",
  127: "Devolución recolectada",
  128: "Devolución fallida",
  130: "Contenerizado",
  131: "Descontenerizado",
  132: "Paquete no arribado",
  133: "Arribo no contenerizado",
  134: "Guía finalizada - Inicio devolución",
  180: "Orden no lista",
  181: "Sobrepeso",
  182: "Cliente no contesta",
  199: "Recepcion de Envió Internacional",
  200: "DISPONIBLE EN CENTRO LOGISTICO",
  201: "En estación",
  202: "En estación equivocada",
  203: "No localizado en media milla",
  204: "Perdido en media milla",
  205: "Dañado",
  206: "Regreso a la estación",
  207: "En espera para salir de nuevo a ruta",
  208: "En espera por solicitud del cliente",
  209: "Disponible para salir al centro de distribución",
  210: "En estacion de ultima milla",
  211: "Paquete reprogramado",
  212: "Robado",
  213: "Datos incorrectos",
  214: "Órden duplicada",
  215: "Órden mal surtida",
  216: "Paquete en estación equivocada",
  217: "Datos actualizados por cliente",
  218: "Órden anulada",
  219: "Orden preasignada a ruta de media milla",
  220: "Cancelado",
  221: "Datos actualizados",
  222: "Paquete no arribado",
  223: "Asignación a tercero",
  224: "Activar orden cancelada",
  225: "Pendiente",
  226: "Pendiente",
  227: "Pendiente",
  228: "Pendiente",
  229: "Dirección incorrecta",
  230: "Disponible en Call Center",
  231: "Orden embarcada",
  232: "Orden arribada a estación",
  233: "Entregado - Media milla",
  240: "Extraviado en estacion de ultima milla",
  241: "Extraviado",
  242: "Destrucción",
  243: "Pasa a cobro",
  244: "Donación",
  245: "Solicitud de investigación",
  300: "Orden preasignada a RUTA",
  301: "Asignado a ruta de última milla",
  302: "Asignado a conductor",
  303: "En transito para entrega",
  304: "Visualización código entrega",
  305: "Código de verificación no proporcionado",
  306: "Orden desasignada de solución de ruteo",
  307: "pago no realizado",
  310: "Intentados no entregados",
  311: "Cliente no disponible (DND)",
  312: "Negocio cerrado",
  313: "Ubicacion no accesible",
  314: "Dirección errónea",
  315: "Fuera de tiempo de entrega",
  316: "No localizado en última milla",
  317: "Perdido en última milla",
  318: "Rechazado por el cliente",
  319: "Fuera de cobertura",
  320: "No entregable Fuerza Mayor",
  321: "Entregado en Sucursal MBE",
  322: "Recibido en tienda",
  323: "Disponible en Sucursal MBE",
  324: "Esperando recibir",
  325: "No conocen a cliente final",
  326: "Demoras por cuestiones climatologicas",
  327: "Demora por falla mecanica",
  328: "Rezago",
  329: "Abandono",
  330: "Intentos agotados",
  331: "Datos de entrega incorrectos",
  332: "Primera llamada",
  333: "Segunda llamada",
  334: "Tercera llamada",
  335: "Zona de NO cobertura",
  350: "Regreso a la estación",
  360: "Entregado al cliente",
  361: "Paquete intercambiado en ruta última milla con otro conductor",
  362: "Conciliado con el banco",
  365: "Confirmación de entrega",
  370: "Entregado al cliente en tienda",
  371: "Se procede al reembolso del dinero al cliente",
  400: "Solicitud de devolucion",
  401: "Devolucion recolectada",
  404: "Incidente en transito",
  406: "Solicitud de devolucion entre almacenes",
  410: "Solicitud de devolucion en almacen final",
  411: "Destino afectado por condiciones de seguridad",
  418: "Rechazado por el cliente",
  420: "Cancelado / Orden anulada",
  499: "Recepción de aduana",
  500: "En tránsito a País",
  501: "Llegada al país",
  502: "Liberado en aduana",
  503: "No recibido",
  504: "Retenido por la aduana",
  505: "Revaluo",
  506: "Cambio de modalidad",
  507: "Detenido con novedad",
  508: "Devolución iniciada",
  509: "Devolución proceso",
  511: "Retiro Exitoso",
  512: "Return to central warehouse completed",
  513: "No se dio de baja",
  514: "Ya entregó equipos",
  515: "Arribo a instalaciones desde almacén de agente aduanal",
  516: "No se atiende Retorno",
  600: "Return to central warehouse completed",
  601: "Recoleccion Pendiente",
  602: "En Sucursal Destino",
  603: "En Sucursal Origen",
  604: "En Sucursal Transbordo",
  605: "Entregada Ocurre",
  606: "En Viaje",
  607: "En Embarque",
  608: "En Viaje EAD",
  609: "En Camion EAD",
  610: "Entrega Domicilio",
  611: "En Viaje EAD Rechazada",
};

/**
 * Business rule (hotfix 2026-11-14): only these Pinit codes close a debit card
 * as returned. Every other code is either a delivery or an in-transit state.
 */
export const PINIT_RETURN_CODES: Readonly<Record<number, CardStatus>> = {
  213: CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  420: CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  335: CardStatus.TD_ZONA_FUERA_COBERTURA,
};

/** Codes that confirm the card reached the final customer. */
export const PINIT_DELIVERED_CODES: ReadonlySet<number> = new Set([360, 362, 365, 370, 605, 610]);

/** Failed delivery attempts: still in transit, but flagged as not located. */
export const PINIT_NOT_LOCATED_CODES: ReadonlySet<number> = new Set([
  182, 203, 207, 229, 305, 307, 310, 311, 312, 313, 314, 315, 316, 318, 319, 320, 325, 330, 331, 418,
]);

/** Card is out on a last-mile route. */
export const PINIT_EN_ROUTE_CODES: ReadonlySet<number> = new Set([300, 301, 302, 303, 304, 306, 361]);

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CODE_BY_LABEL: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const [code, label] of Object.entries(PINIT_STATUS_CATALOG)) {
    const key = normalizeLabel(label);
    // Keep the first (lowest) code for duplicated labels; duplicates share the same bucket.
    if (!map.has(key)) map.set(key, Number(code));
  }
  return map;
})();

/** Extracts the Pinit numeric code from "360 - Entregado al cliente" or a bare label. */
export function resolvePinitCode(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{3})\b/);
  if (match) return Number(match[1]);
  return CODE_BY_LABEL.get(normalizeLabel(raw)) ?? null;
}

/** Maps a Pinit code to the Celego debit CardStatus. */
export function mapPinitCodeToCardStatus(code: number): CardStatus {
  if (PINIT_RETURN_CODES[code]) return PINIT_RETURN_CODES[code];
  if (PINIT_DELIVERED_CODES.has(code)) return CardStatus.TD_ENTREGADO;
  if (PINIT_NOT_LOCATED_CODES.has(code)) return CardStatus.NO_LOCALIZADO;
  if (PINIT_EN_ROUTE_CODES.has(code)) return CardStatus.EN_RUTA;
  return CardStatus.DESPACHADA;
}

/** Human-readable "360 - Entregado al cliente" for a code, falling back to the raw text. */
export function formatPinitStatus(raw: string): string {
  const code = resolvePinitCode(raw);
  if (code == null) return raw.trim();
  const label = PINIT_STATUS_CATALOG[code];
  return label ? `${code} - ${label}` : raw.trim();
}
