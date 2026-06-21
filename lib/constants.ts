export const ZONAS = ["Metro", "Este", "Norte", "Sur"] as const;

export const PROVINCIAS_INICIALES = [
  { nombre: "Santo Domingo", zona: "Metro" },
  { nombre: "Higuey", zona: "Este" },
  { nombre: "La Romana", zona: "Este" },
  { nombre: "San Pedro", zona: "Este" },
  { nombre: "San Pedro de Macoris", zona: "Este" },
  { nombre: "Punta Cana", zona: "Este" },
  { nombre: "Santiago", zona: "Norte" },
  { nombre: "San Francisco", zona: "Norte" },
  { nombre: "San Francisco de Macoris", zona: "Norte" },
  { nombre: "San Cristobal", zona: "Sur" },
  { nombre: "Puerto Plata", zona: "Norte" },
  { nombre: "Bani", zona: "Sur" },
] as const;

export const CARD_STATUSES = [
  "DESPACHADA",
  "ENVIADA_INTERIOR",
  "EN_RUTA",
  "ACUSE_RECIBIDO",
  "DEVUELTA_TIENDA",
  "ENTREGA_DIGITAL",
  "ENTREGADA",
  "RETORNADA",
] as const;

export const ROLE_LABELS = {
  ADMIN: "Administrador",
  OPERADOR: "Operador",
  FACTURACION: "Facturacion",
  MENSAJERO: "Mensajero",
} as const;

export const RETURN_REASONS_DEFAULT = [
  "Direccion incorrecta",
  "Cliente no localizado",
  "Cliente rechazo",
  "Direccion no existe",
  "Empresa cerrada",
  "Fuera de ruta",
  "Otro",
] as const;

export const MODULES = [
  "dashboard",
  "tarjetas",
  "consolidado_debito",
  "modificacion_masiva",
  "status_digitales",
  "rastreo_masivo",
  "sla_vencidas",
  "rutas",
  "flota",
  "piloto_movil",
  "operativo",
  "redaccion",
  "mensajeros",
  "facturacion",
  "reportes",
  "configuracion",
] as const;

export type ModuleName = (typeof MODULES)[number];
