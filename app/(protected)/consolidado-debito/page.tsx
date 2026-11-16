import { redirect } from "next/navigation";

/** The debit consolidation tool now lives in the Tarjetas import modal. */
export default function ConsolidadoDebitoPage() {
  redirect("/tarjetas?importar=1");
}
