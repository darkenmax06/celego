import { requireRole } from "@/lib/server-auth";
import SlaVencidasClient from "./sla-vencidas-client";

export default async function SlaVencidasPage() {
  // Same roles `RESOURCE_SECURITY["sla-vencidas"]` already allows on the API.
  const session = await requireRole(["ADMIN", "OPERADOR", "FACTURACION"]);
  return <SlaVencidasClient role={session.user.role} />;
}
