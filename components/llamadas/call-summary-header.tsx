import { CalendarClock, Layers, MapPin, Phone, Truck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { ContactStateBadge } from "@/components/cards/contact-state-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ContactoEstado } from "@/lib/cards/card-tile-data";
import { formatTemplateDate, formatTipoTarjeta } from "@/lib/contact-template";
import type { CallHistorialCard } from "@/lib/llamadas/call-detail";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** Calls overhaul: card summary at the top of the call detail screen. */
export function CallSummaryHeader({
  card,
  contactoEstado,
  attempts,
}: {
  card: CallHistorialCard;
  contactoEstado: ContactoEstado;
  attempts: number;
}) {
  const op = card.operativo;
  const canal = typeof op.canalContacto === "string" ? op.canalContacto : null;
  const asignado = card.asignacion?.asignadoA ?? null;

  return (
    <section aria-label="Resumen de la tarjeta" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold text-slate-900">{card.nombre}</h2>
            <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs font-semibold text-blue-800">{card.tc}</span>
            {card.urgent ? (
              <span className="rounded-md border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-800">
                Urgente
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Cédula <strong className="text-slate-700">{card.cedula}</strong>
            {card.requestNumber ? (
              <>
                {" "}
                · Solicitud <strong className="text-slate-700">{card.requestNumber}</strong>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ContactStateBadge value={contactoEstado} canal={canal} className="text-xs" />
          <StatusBadge value={card.status} />
        </div>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Producto">{formatTipoTarjeta(card.productType) || "—"}</Field>
        <Field label="Provincia / Zona">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-blue-600" />
            {card.provincia} · {card.zona}
          </span>
        </Field>
        <Field label="Vence SLA">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5 text-rose-600" />
            {formatTemplateDate(card.slaDueDate) || "—"}
          </span>
        </Field>
        <Field label="Intentos de llamada">{attempts}</Field>
        <Field label="Asignada a">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5 text-slate-500" />
            {asignado ? asignado.name : "Sin asignar"}
          </span>
          {card.asignacion?.asignadoPor ? (
            <span className="block text-[11px] font-normal text-slate-500">
              por {card.asignacion.asignadoPor.name} · {formatTemplateDate(card.asignacion.updatedAt)}
            </span>
          ) : null}
        </Field>
        <Field label="Mensajero">
          <span className="inline-flex items-center gap-1">
            <Truck className="h-3.5 w-3.5 text-slate-500" />
            {card.mensajero ? card.mensajero.nombre : "Sin asignar"}
          </span>
          {card.mensajero?.telefono ? (
            <span className="block text-[11px] font-normal text-slate-500">{card.mensajero.telefono}</span>
          ) : null}
        </Field>
        <Field label="Teléfonos">
          <span className="inline-flex flex-wrap items-center gap-1">
            <Phone className="h-3.5 w-3.5 text-slate-500" />
            {card.telefonos.length ? card.telefonos.join(", ") : "—"}
          </span>
        </Field>
        <Field label="Grupos">
          <span className="inline-flex flex-wrap items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-slate-500" />
            {card.grupos.length
              ? card.grupos.map((grupo) => (
                  <span key={grupo} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    {grupo}
                  </span>
                ))
              : "—"}
          </span>
        </Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <Field label="Dirección registrada">{card.direccion || "—"}</Field>
        </div>
        {typeof op.nuevaDireccion === "string" && op.nuevaDireccion ? (
          <div className="sm:col-span-2">
            <Field label="Nueva dirección confirmada">{op.nuevaDireccion}</Field>
          </div>
        ) : null}
        {typeof op.fechaPreferenciaEntrega === "string" && op.fechaPreferenciaEntrega ? (
          <Field label="Fecha de entrega preferida">{formatTemplateDate(op.fechaPreferenciaEntrega)}</Field>
        ) : null}
      </dl>
    </section>
  );
}
