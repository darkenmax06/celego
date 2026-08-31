import { requireRole } from "@/lib/server-auth";
import ConsolidadoDebitoClient from "./consolidado-debito-client";

export default async function ConsolidadoDebitoPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <ConsolidadoDebitoClient />;
}
