import { type UserRole } from "@prisma/client";
import { type ModuleName } from "@/lib/constants";

const ACCESS: Record<ModuleName, UserRole[]> = {
  dashboard: ["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"],
  tarjetas: ["ADMIN", "OPERADOR"],
  modificacion_masiva: ["ADMIN", "OPERADOR"],
  status_digitales: ["ADMIN", "OPERADOR"],
  rastreo_masivo: ["ADMIN", "OPERADOR", "FACTURACION"],
  sla_vencidas: ["ADMIN", "OPERADOR", "FACTURACION"],
  rutas: ["ADMIN", "OPERADOR"],
  operativo: ["ADMIN", "OPERADOR"],
  redaccion: ["ADMIN", "OPERADOR"],
  mensajeros: ["ADMIN", "OPERADOR"],
  facturacion: ["ADMIN", "FACTURACION"],
  reportes: ["ADMIN", "OPERADOR", "FACTURACION"],
  configuracion: ["ADMIN"],
};

export function canAccessModule(role: UserRole, module: ModuleName) {
  return ACCESS[module].includes(role);
}

export function getModulesForRole(role: UserRole) {
  return (Object.keys(ACCESS) as ModuleName[]).filter((module) =>
    canAccessModule(role, module),
  );
}
