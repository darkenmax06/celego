import { requireRole } from "@/lib/server-auth";
import MisGestionesClient from "./mis-gestiones-client";

/** Calls overhaul: cards assigned to the session operator (ADMIN may browse any operator). */
export default async function MisGestionesPage() {
  const session = await requireRole(["ADMIN", "OPERADOR"]);
  return <MisGestionesClient isAdmin={session.user.role === "ADMIN"} />;
}
