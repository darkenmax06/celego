import { requireRole } from "@/lib/server-auth";
import TarjetasClient from "./tarjetas-client";

export default async function TarjetasPage() {
  const session = await requireRole(["ADMIN", "OPERADOR"]);
  return <TarjetasClient role={session.user.role} />;
}
