import { cn } from "@/lib/utils";

export function StatusBadge({
  value,
}: {
  value: string;
}) {
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    DESPACHADA: "bg-indigo-100 text-indigo-700",
    ENVIADA_INTERIOR: "bg-violet-100 text-violet-700",
    EN_RUTA: "bg-sky-100 text-sky-700",
    EN_PROCESO: "bg-amber-100 text-amber-700",
    ENTREGA_DIGITAL: "bg-fuchsia-100 text-fuchsia-700",
    ENTREGADA: "bg-emerald-100 text-emerald-700",
    RETORNADA: "bg-rose-100 text-rose-700",
    ACUSE_RECIBIDO: "bg-emerald-100 text-emerald-700",
    DEVUELTA_A_TIENDA: "bg-rose-100 text-rose-700",
    DEVUELTA_TIENDA: "bg-rose-100 text-rose-700",
    PENDIENTE: "bg-slate-100 text-slate-700",
    COMPLETADA: "bg-emerald-100 text-emerald-700",
    TD_ENTREGADO: "bg-emerald-100 text-emerald-700",
    TD_DEVUELTO_NO_LOCALIZADO: "bg-rose-100 text-rose-700",
    TD_NO_LE_INTERESA: "bg-rose-100 text-rose-700",
    TD_RETIRADA_EN_OFICINA: "bg-amber-100 text-amber-700",
    TD_SOLICITADA_POR_ERROR: "bg-rose-100 text-rose-700",
    TD_ZONA_FUERA_COBERTURA: "bg-rose-100 text-rose-700",
    NO_LOCALIZADO: "bg-orange-100 text-orange-700",
    ENTREGA_DIGITAL_SIN_CONTRATO: "bg-amber-100 text-amber-700",
    ENTREGA_SIN_CONTRATO: "bg-amber-100 text-amber-700",
    EN_PROCESO_DE_RETORNO: "bg-cyan-100 text-cyan-700",
  };

  let label = value.replaceAll("_", " ");
  if (upper.startsWith("TD_")) {
    label = upper.replace(/^TD_/, "TD- ").replaceAll("_", " ");
  }

  return (
    <span
      title={label}
      className={cn(
        "inline-block max-w-full truncate rounded-md px-2 py-1 font-display text-[11px] font-semibold tracking-wide whitespace-nowrap",
        map[upper] ?? "bg-slate-100 text-slate-700",
      )}
    >
      {label}
    </span>
  );
}
