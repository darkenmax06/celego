import PilotoMovilClient from "./piloto-movil-client";
import { requireRole } from "@/lib/server-auth";

export default async function PilotoMovilPage() {
  await requireRole(["ADMIN"]);

  return <PilotoMovilClient />;
}
