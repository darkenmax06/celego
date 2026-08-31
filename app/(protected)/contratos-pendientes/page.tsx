import { requireRole } from "@/lib/server-auth";
import ContratosPendientesClient from "./contratos-pendientes-client";

export default async function ContratosPendientesPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <ContratosPendientesClient />;
}
