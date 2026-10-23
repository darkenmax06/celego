import { requireRole } from "@/lib/server-auth";
import LlamadaDetailClient from "./llamada-detail-client";

type Props = {
  params: Promise<{ cardId: string }>;
};

/**
 * Calls overhaul: call detail screen. Readable by the union of the
 * `operativo` and `sla_vencidas` ACL roles; registering a call (POST
 * /api/operativo/contacto) stays ADMIN/OPERADOR only.
 */
export default async function LlamadaDetailPage({ params }: Props) {
  const session = await requireRole(["ADMIN", "OPERADOR", "FACTURACION"]);
  const { cardId } = await params;
  const canCall = session.user.role === "ADMIN" || session.user.role === "OPERADOR";
  return <LlamadaDetailClient cardId={cardId} operatorName={session.user.name ?? null} canCall={canCall} />;
}
