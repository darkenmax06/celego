import { requireRole } from "@/lib/server-auth";
import ModificacionMasivaClient from "./modificacion-masiva-client";

export default async function ModificacionMasivaPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <ModificacionMasivaClient />;
}
