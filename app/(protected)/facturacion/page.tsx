import { requireRole } from "@/lib/server-auth";
import FacturacionClient from "./facturacion-client";

export default async function FacturacionPage() {
  await requireRole(["ADMIN", "FACTURACION"]);
  return <FacturacionClient />;
}
