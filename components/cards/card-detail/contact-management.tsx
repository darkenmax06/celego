"use client";

import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";

export type OperativoMetadata = {
  contactado?: boolean;
  canalContacto?: "WHATSAPP" | "LLAMADA_DIRECTA" | null;
  comentarioContacto?: string;
  telefonos?: Array<{ num: string; principal: boolean; funciona: boolean; comentario?: string }>;
  nuevaDireccion?: string | null;
  fechaPreferenciaEntrega?: string | null;
  solicitudRetorno?: boolean;
  motivoRetorno?: string | null;
  traslado?: {
    provinciaDestino?: string;
    motivo?: string;
    solicitadoAt?: string;
    solicitadoPor?: string;
  } | null;
  updatedAt?: string;
};

type OperativoProps = { operativo: OperativoMetadata | null };

export function ContactStateBadge({ operativo }: OperativoProps) {
  if (operativo?.solicitudRetorno) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">
        <AlertTriangle className="h-3.5 w-3.5" /> Retorno Solicitado
      </span>
    );
  }
  if (operativo?.traslado && Object.keys(operativo.traslado).length > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
        <Send className="h-3.5 w-3.5" /> Traslado Solicitado
      </span>
    );
  }
  if (operativo?.contactado) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Contactada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      <Clock className="h-3.5 w-3.5" /> Pendiente de Contacto
    </span>
  );
}

export function ContactChannelLabel({ operativo }: OperativoProps) {
  if (operativo?.canalContacto === "WHATSAPP") {
    return (
      <>
        <MessageSquare className="h-4 w-4 text-emerald-600" /> WhatsApp
      </>
    );
  }
  if (operativo?.canalContacto === "LLAMADA_DIRECTA") {
    return (
      <>
        <Phone className="h-4 w-4 text-blue-600" /> Llamada Directa
      </>
    );
  }
  return <span className="font-normal text-slate-400">No especificado</span>;
}

type PanelProps = OperativoProps & { onOpenWizard: () => void };

/** Operational contact management block (state, channel, agreements, verified phones). */
export function ContactManagementPanel({ operativo, onOpenWizard }: PanelProps) {
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Historial y datos acordados con el cliente</p>
        <button
          type="button"
          onClick={onOpenWizard}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-300" />
          Abrir Asistente de Contacto
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="mb-1 block text-xs text-slate-500">Estado de contacto</span>
          <div>
            <ContactStateBadge operativo={operativo} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="mb-1 block text-xs text-slate-500">Canal efectivo</span>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <ContactChannelLabel operativo={operativo} />
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="mb-1 block text-xs text-slate-500">Fecha preferencia</span>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Calendar className="h-4 w-4 text-slate-400" />
            {operativo?.fechaPreferenciaEntrega ? (
              new Date(operativo.fechaPreferenciaEntrega).toLocaleDateString("es-DO")
            ) : (
              <span className="font-normal text-slate-400">Sin fecha fijada</span>
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="mb-1 block text-xs text-slate-500">Última gestión</span>
          <p className="text-xs font-semibold text-slate-800">
            {operativo?.updatedAt ? (
              new Date(operativo.updatedAt).toLocaleString("es-DO")
            ) : (
              <span className="font-normal text-slate-400">Sin registro previo</span>
            )}
          </p>
        </div>
      </div>

      {operativo?.nuevaDireccion ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-800">
            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
            Nueva dirección de entrega (confirmada):
          </div>
          <p className="mt-1 font-medium leading-relaxed text-slate-800">{operativo.nuevaDireccion}</p>
        </div>
      ) : null}

      {operativo?.solicitudRetorno && operativo?.motivoRetorno ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs">
          <span className="font-bold text-rose-800">Motivo de solicitud de retorno:</span>
          <p className="mt-1 font-medium text-rose-900">{operativo.motivoRetorno}</p>
        </div>
      ) : null}

      {operativo?.traslado && typeof operativo.traslado === "object" && operativo.traslado.provinciaDestino ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs">
          <span className="font-bold text-indigo-800">Traslado a otra provincia solicitado:</span>
          <p className="mt-1 text-indigo-900">
            Destino: <strong>{operativo.traslado.provinciaDestino}</strong> · Motivo:{" "}
            {operativo.traslado.motivo || "Traslado solicitado"}
          </p>
        </div>
      ) : null}

      {operativo?.comentarioContacto ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <span className="font-bold text-slate-700">Observaciones de la llamada:</span>
          <p className="mt-1 leading-relaxed text-slate-700">{operativo.comentarioContacto}</p>
        </div>
      ) : null}

      {operativo?.telefonos && operativo.telefonos.length > 0 ? (
        <div className="space-y-1.5 pt-1">
          <span className="text-xs text-slate-500">Teléfonos verificados / actualizados</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {operativo.telefonos.map((t, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-xl border p-2.5 text-xs ${
                  t.funciona ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={t.principal ? "font-bold text-amber-500" : "text-slate-300"}>★</span>
                  <span className="font-mono font-bold text-slate-900">{t.num}</span>
                  {t.funciona ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      Funciona
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">No funciona</span>
                  )}
                </div>
                {t.comentario ? (
                  <span className="max-w-[160px] truncate text-[11px] text-slate-500" title={t.comentario}>
                    {t.comentario}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
