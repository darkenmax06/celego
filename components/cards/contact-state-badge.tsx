import { cn } from "@/lib/utils";
import { CONTACTO_ESTADO_LABELS, type ContactoEstado } from "@/lib/cards/card-tile-data";

const STYLES: Record<ContactoEstado, { icon: string; className: string }> = {
  CONTACTADA: { icon: "✓", className: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  NO_CONTACTADA: { icon: "○", className: "bg-amber-50 border-amber-200 text-amber-800" },
  RETORNO_SOLICITADO: { icon: "⚠", className: "bg-rose-50 border-rose-200 text-rose-700" },
  TRASLADO_SOLICITADO: { icon: "✈", className: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  PENDIENTE: { icon: "•", className: "bg-slate-100 border-slate-200 text-slate-600" },
};

/** Presentational badge for a card's contact state (shared by tiles, the call detail and the wizard). */
export function ContactStateBadge({
  value,
  canal,
  className,
}: {
  value: ContactoEstado;
  canal?: string | null;
  className?: string;
}) {
  const style = STYLES[value];
  const canalLabel = canal === "WHATSAPP" ? "WhatsApp" : canal === "LLAMADA_DIRECTA" ? "Llamada" : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold",
        style.className,
        className,
      )}
    >
      {style.icon} {CONTACTO_ESTADO_LABELS[value]}
      {value === "CONTACTADA" && canalLabel ? ` (${canalLabel})` : ""}
    </span>
  );
}
