import { requireRole } from "@/lib/server-auth";
import ImportacionClient from "./importacion-client";

export default async function ImportacionPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <ImportacionClient />;
}
