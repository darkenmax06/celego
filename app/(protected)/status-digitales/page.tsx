import { requireRole } from "@/lib/server-auth";
import StatusDigitalesClient from "./status-digitales-client";

export default async function StatusDigitalesPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  return <StatusDigitalesClient />;
}
