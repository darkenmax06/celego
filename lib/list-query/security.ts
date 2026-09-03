import type { UserRole } from "@prisma/client";

export type ResourceSecurityConfig = {
  readonly allowedRoles: readonly UserRole[];
  readonly prismaDelegate: "card" | "route" | "messenger" | "redaction" | "cardBatch" | "user" | "auditLog" | "bizcochitoBatch";
  readonly allowedFields: readonly string[];
  readonly baseWhere?: () => Record<string, unknown>;
};

export const RESOURCE_SECURITY: Readonly<Record<string, ResourceSecurityConfig>> = {
  tarjetas: {
    allowedRoles: ["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"],
    prismaDelegate: "card",
    allowedFields: ["status", "provincia", "zona", "dispatchOrigin", "urgent", "isRemote", "productType"],
  },
  rutas: {
    allowedRoles: ["ADMIN", "OPERADOR", "FACTURACION"],
    prismaDelegate: "route",
    allowedFields: ["status", "messengerId", "zona"],
  },
  mensajeros: {
    allowedRoles: ["ADMIN", "OPERADOR", "FACTURACION"],
    prismaDelegate: "messenger",
    allowedFields: ["zonaPrincipal", "provinciaTrabajo", "activo"],
  },
  redacciones: {
    allowedRoles: ["ADMIN", "OPERADOR", "FACTURACION"],
    prismaDelegate: "redaction",
    allowedFields: ["tipo", "status", "zona", "dispatchOrigin", "anulada"],
  },
  lotes: {
    allowedRoles: ["ADMIN", "OPERADOR", "FACTURACION"],
    prismaDelegate: "cardBatch",
    allowedFields: ["banco", "status"],
  },
  "config-usuarios": {
    allowedRoles: ["ADMIN"],
    prismaDelegate: "user",
    allowedFields: ["role", "active"],
  },
  actividad: {
    allowedRoles: ["ADMIN"],
    prismaDelegate: "auditLog",
    allowedFields: ["action", "entityType", "success"],
  },
  "operativo-contacto": {
    allowedRoles: ["ADMIN", "OPERADOR"],
    prismaDelegate: "card",
    allowedFields: ["status", "provincia", "zona", "urgent", "isRemote", "productType"],
  },
  bizcochitos: {
    allowedRoles: ["ADMIN", "OPERADOR"],
    prismaDelegate: "bizcochitoBatch",
    allowedFields: ["sequence"],
  },
  "sla-vencidas": {
    allowedRoles: ["ADMIN", "OPERADOR", "FACTURACION"],
    prismaDelegate: "card",
    allowedFields: ["status", "provincia", "zona", "currentMessengerId", "isAdditional", "productType"],
    baseWhere: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        status: {
          notIn: [
            "ENTREGADA",
            "ENTREGA_DIGITAL",
            "RETORNADA",
            "ACUSE_RECIBIDO",
            "DEVUELTA_TIENDA",
            "TD_ENTREGADO",
            "TD_DEVUELTO_NO_LOCALIZADO",
            "TD_NO_LE_INTERESA",
            "TD_RETIRADA_EN_OFICINA",
            "TD_SOLICITADA_POR_ERROR",
            "TD_ZONA_FUERA_COBERTURA",
          ],
        },
        slaDueDate: { lt: today },
      };
    },
  },
};
