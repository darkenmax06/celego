import { requireRole } from "@/lib/server-auth";
import RedaccionClient from "./redaccion-client";

export default async function RedaccionPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <RedaccionClient />;
}
