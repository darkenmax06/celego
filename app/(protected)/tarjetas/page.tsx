import { requireRole } from "@/lib/server-auth";
import TarjetasClient from "./tarjetas-client";

export default async function TarjetasPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <TarjetasClient />;
}
