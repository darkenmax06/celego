import FlotaClient from "./flota-client";
import { requireRole } from "@/lib/server-auth";

export default async function FlotaPage() {
  await requireRole(["ADMIN"]);

  return <FlotaClient />;
}
