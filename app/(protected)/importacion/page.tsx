import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";

/** The importers now live in a modal on the Tarjetas page; keep old links working. */
export default async function ImportacionPage() {
  await requireRole(["ADMIN", "OPERADOR"]);
  redirect("/tarjetas?importar=1");
}
