import { requireRole } from "@/lib/server-auth";
import OperativoClient from "./operativo-client";

export default async function OperativoPage() {
  const session = await requireRole(["ADMIN", "OPERADOR"]);
  return <OperativoClient role={session.user.role} />;
}
