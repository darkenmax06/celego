import { requireRole } from "@/lib/server-auth";
import ConfiguracionClient from "./configuracion-client";

export default async function ConfiguracionPage() {
  await requireRole(["ADMIN"]);
  return <ConfiguracionClient />;
}
