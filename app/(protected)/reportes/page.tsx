import { requireRole } from "@/lib/server-auth";
import ReportesClient from "./reportes-client";

export default async function ReportesPage() {
  await requireRole(["ADMIN", "OPERADOR", "FACTURACION"]);
  return <ReportesClient />;
}
