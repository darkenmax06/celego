import { requireRole } from "@/lib/server-auth";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  await requireRole(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  return <DashboardClient />;
}
