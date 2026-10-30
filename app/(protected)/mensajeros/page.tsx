import { requireRole } from "@/lib/server-auth";
import MensajerosClient from "./mensajeros-client";

export default async function MensajerosPage() {
  const session = await requireRole(["ADMIN", "OPERADOR"]);
  return <MensajerosClient canDelete={session.user.role === "ADMIN"} />;
}
