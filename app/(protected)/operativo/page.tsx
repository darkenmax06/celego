import { requireRole } from "@/lib/server-auth";
import OperativoClient from "./operativo-client";

export default async function OperativoPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <OperativoClient />;
}
