export const ZONAS = ["Metro", "Este", "Norte", "Sur"] as const;

export const PROVINCIAS_INICIALES = [
  // ── Metro ──────────────────────────────────────────────────────────────
  { nombre: "Santo Domingo",              zona: "Metro" },
  { nombre: "Distrito Nacional",          zona: "Metro" },
  { nombre: "Monte Plata",               zona: "Metro" },
  // ── Este ───────────────────────────────────────────────────────────────
  { nombre: "La Romana",                  zona: "Este"  },
  { nombre: "La Altagracia",              zona: "Este"  },
  { nombre: "San Pedro de Macoris",       zona: "Este"  },
  { nombre: "El Seibo",                   zona: "Este"  },
  { nombre: "Hato Mayor",                 zona: "Este"  },
  { nombre: "Higuey",                     zona: "Este"  },
  { nombre: "Punta Cana",                 zona: "Este"  },
  // ── Norte ──────────────────────────────────────────────────────────────
  { nombre: "Santiago",                   zona: "Norte" },
  { nombre: "Puerto Plata",               zona: "Norte" },
  { nombre: "La Vega",                    zona: "Norte" },
  { nombre: "Espaillat",                  zona: "Norte" },
  { nombre: "Monsenor Nouel",             zona: "Norte" },
  { nombre: "San Francisco de Macoris",   zona: "Norte" },
  { nombre: "Duarte",                     zona: "Norte" },
  { nombre: "Maria Trinidad Sanchez",     zona: "Norte" },
  { nombre: "Hermanas Mirabal",           zona: "Norte" },
  { nombre: "Sanchez Ramirez",            zona: "Norte" },
  { nombre: "Samana",                     zona: "Norte" },
  { nombre: "Montecristi",               zona: "Norte" },
  { nombre: "Dajabon",                    zona: "Norte" },
  { nombre: "Valverde",                   zona: "Norte" },
  { nombre: "Santiago Rodriguez",         zona: "Norte" },
  // ── Sur ────────────────────────────────────────────────────────────────
  { nombre: "San Cristobal",              zona: "Sur"   },
  { nombre: "Bani",                       zona: "Sur"   },
  { nombre: "Peravia",                    zona: "Sur"   },
  { nombre: "Azua",                       zona: "Sur"   },
  { nombre: "San Jose de Ocoa",           zona: "Sur"   },
  { nombre: "San Juan",                   zona: "Sur"   },
  { nombre: "Barahona",                   zona: "Sur"   },
  { nombre: "Bahoruco",                   zona: "Sur"   },
  { nombre: "Independencia",              zona: "Sur"   },
  { nombre: "Pedernales",                 zona: "Sur"   },
  { nombre: "Elias Pina",                 zona: "Sur"   },
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

export const DEBIT_CARD_STATUSES = [
  "DESPACHADA",
  "EN_RUTA",
  "TD_ENTREGADO",
  "TD_DEVUELTO_NO_LOCALIZADO",
  "TD_NO_LE_INTERESA",
  "TD_RETIRADA_EN_OFICINA",
  "TD_SOLICITADA_POR_ERROR",
  "TD_ZONA_FUERA_COBERTURA",
  "NO_LOCALIZADO",
] as const;

export const ALL_CARD_STATUSES = [
  "DESPACHADA",
  "ENVIADA_INTERIOR",
  "EN_RUTA",
  "ACUSE_RECIBIDO",
  "DEVUELTA_TIENDA",
  "ENTREGA_DIGITAL",
  "ENTREGADA",
  "RETORNADA",
  "TD_ENTREGADO",
  "TD_DEVUELTO_NO_LOCALIZADO",
  "TD_NO_LE_INTERESA",
  "TD_RETIRADA_EN_OFICINA",
  "TD_SOLICITADA_POR_ERROR",
  "TD_ZONA_FUERA_COBERTURA",
  "NO_LOCALIZADO",
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
  "contratos_pendientes",
  "redaccion",
  "mensajeros",
  "facturacion",
  "reportes",
  "configuracion",
] as const;

export type ModuleName = (typeof MODULES)[number];
