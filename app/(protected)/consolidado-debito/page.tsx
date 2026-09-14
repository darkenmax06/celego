import { redirect } from "next/navigation";

/** The debit consolidation tool now lives inside the Importación page. */
export default function ConsolidadoDebitoPage() {
  redirect("/importacion");
}
