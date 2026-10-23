import { requireRole } from "@/lib/server-auth";
import AsignarGestionesClient from "./asignar-client";

/** Calls overhaul: bulk call-assignment screen (POST/DELETE /api/llamadas/asignaciones). */
export default async function AsignarGestionesPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <AsignarGestionesClient />;
}
