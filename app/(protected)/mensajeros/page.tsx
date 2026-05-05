import { requireRole } from "@/lib/server-auth";
import MensajerosClient from "./mensajeros-client";

export default async function MensajerosPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <MensajerosClient />;
}
