import { requireRole } from "@/lib/server-auth";
import RutasClient from "./rutas-client";

export default async function RutasPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <RutasClient />;
}
