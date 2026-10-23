import { MessageSquare, Phone, UserRound } from "lucide-react";
import { ContactStateBadge } from "@/components/cards/contact-state-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONTACTO_ESTADO_LABELS, type ContactoEstado } from "@/lib/cards/card-tile-data";
import { isPhoneCallState, PHONE_CALL_STATE_LABELS } from "@/lib/contact-call-shared";
import { formatCanalContacto, formatTemplateDate } from "@/lib/contact-template";
import { parseTelefonosDetalle, type CallHistorialEntry } from "@/lib/llamadas/call-detail";

function resultadoOf(entry: CallHistorialEntry): ContactoEstado {
  if (entry.resultado && entry.resultado in CONTACTO_ESTADO_LABELS) return entry.resultado as ContactoEstado;
  return entry.contactado ? "CONTACTADA" : "NO_CONTACTADA";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
}

function snapshotStatusChange(snapshot: unknown): { from: string; to: string } | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const record = snapshot as Record<string, unknown>;
  const from = typeof record.status === "string" ? record.status : null;
  const to = typeof record.statusDespues === "string" ? record.statusDespues : null;
  return from && to && from !== to ? { from, to } : null;
}

/** Calls overhaul: chronological (newest first) list of call attempts for one card. */
export function CallHistoryTimeline({ historial }: { historial: CallHistorialEntry[] }) {
  if (!historial.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Aún no hay llamadas registradas para esta tarjeta.
      </p>
    );
  }

  return (
    <ol aria-label="Historial de llamadas" className="relative space-y-4 border-l-2 border-slate-200 pl-5">
      {historial.map((entry) => {
        const phones = parseTelefonosDetalle(entry.telefonosDetalle);
        const canal = formatCanalContacto(entry.canalContacto);
        const statusChange = snapshotStatusChange(entry.snapshot);
        return (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-white bg-blue-600 ring-2 ring-blue-100" />
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <time dateTime={entry.createdAt} className="text-sm font-semibold text-slate-900">
                    {formatDateTime(entry.createdAt)}
                  </time>
                  <ContactStateBadge value={resultadoOf(entry)} />
                  {canal ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      {entry.canalContacto === "WHATSAPP" ? <MessageSquare className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                      {canal}
                    </span>
                  ) : null}
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <UserRound className="h-3.5 w-3.5" />
                  {entry.usuario?.name ?? "Operador desconocido"}
                </span>
              </header>

              {phones.length ? (
                <ul className="mt-3 space-y-1">
                  {phones.map((phone, index) => (
                    <li key={`${phone.numero}-${index}`} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-800">{phone.numero}</span>
                      {phone.estado ? (
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-700">
                          {isPhoneCallState(phone.estado) ? PHONE_CALL_STATE_LABELS[phone.estado] : phone.estado}
                        </span>
                      ) : null}
                      {phone.nota ? <span className="italic text-slate-600">“{phone.nota}”</span> : null}
                    </li>
                  ))}
                </ul>
              ) : entry.telefonosUsados ? (
                <p className="mt-3 text-xs text-slate-600">Teléfonos usados: {entry.telefonosUsados}</p>
              ) : null}

              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                {entry.motivoNoContacto ? (
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-slate-500">Motivo no contacto</dt>
                    <dd className="text-slate-800">{entry.motivoNoContacto}</dd>
                  </div>
                ) : null}
                {entry.comentario ? (
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-slate-500">Comentario</dt>
                    <dd className="text-slate-800">{entry.comentario}</dd>
                  </div>
                ) : null}
                {entry.nuevaDireccion ? (
                  <div>
                    <dt className="font-semibold text-slate-500">Nueva dirección</dt>
                    <dd className="text-slate-800">{entry.nuevaDireccion}</dd>
                  </div>
                ) : null}
                {entry.fechaPreferenciaEntrega ? (
                  <div>
                    <dt className="font-semibold text-slate-500">Fecha de entrega</dt>
                    <dd className="text-slate-800">{formatTemplateDate(entry.fechaPreferenciaEntrega)}</dd>
                  </div>
                ) : null}
                {statusChange ? (
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-slate-500">Cambio de estado</dt>
                    <dd className="flex items-center gap-1.5">
                      <StatusBadge value={statusChange.from} /> → <StatusBadge value={statusChange.to} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
