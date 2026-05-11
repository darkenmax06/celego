"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

const reportTypes = [
  { value: "tarjetas", label: "Tarjetas" },
  { value: "contactos", label: "Contactos" },
  { value: "facturacion", label: "Facturacion" },
  { value: "redaccion", label: "Entregas y Retornos" },
] as const;

const formats = ["xlsx", "csv", "pdf"] as const;

export default function ReportesClient() {
  const [type, setType] = useState<(typeof reportTypes)[number]["value"]>("tarjetas");
  const [status, setStatus] = useState("ALL");
  const [zona, setZona] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");

  async function exportFile(format: (typeof formats)[number]) {
    const params = new URLSearchParams({ type, format });
    if (status !== "ALL") params.set("status", status);
    if (zona !== "ALL") params.set("zona", zona);
    if (type === "tarjetas") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }

    const res = await fetch(`/api/reportes/export?${params.toString()}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "No se pudo exportar" }));
      setMessage(data.error ?? "No se pudo exportar");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ext = format;
    a.href = url;
    a.download = `${type}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Reporte ${format.toUpperCase()} generado`);
  }

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Exportacion en Excel, CSV y PDF con parametros de filtro" />

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <Panel title="Parametros">
          <div className="space-y-3">
            <label className="block text-sm text-slate-600">
              Tipo de reporte
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                {reportTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Estado (solo tarjetas)
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="ALL">Todos</option>
                <option value="DESPACHADA">Despachada</option>
                <option value="ENVIADA_INTERIOR">Enviada Interior</option>
                <option value="EN_RUTA">En Ruta</option>
                <option value="ACUSE_RECIBIDO">Acuse recibido</option>
                <option value="DEVUELTA_TIENDA">Devuelta a tienda</option>
                <option value="ENTREGA_DIGITAL">Entrega digital</option>
                <option value="ENTREGADA">Entregada</option>
                <option value="RETORNADA">Retornada</option>
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Zona (tarjetas/redaccion)
              <select value={zona} onChange={(e) => setZona(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="ALL">Todas</option>
                <option>Metro</option>
                <option>Este</option>
                <option>Norte</option>
                <option>Sur</option>
              </select>
            </label>

            {type === "tarjetas" ? (
              <div className="grid gap-2 md:grid-cols-2">
                <label className="block text-sm text-slate-600">
                  Despacho desde
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  Despacho hasta
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Formatos de salida">
          <div className="grid gap-3 md:grid-cols-3">
            {formats.map((format) => (
              <button
                key={format}
                onClick={() => void exportFile(format)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-500 hover:bg-white"
              >
                Exportar {format}
              </button>
            ))}
          </div>

          {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

          <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
            <p className="mb-2 font-semibold text-slate-900">Reportes rapidos</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Tarjetas entregadas hoy</li>
              <li>Tarjetas retornadas del mes</li>
              <li>Facturacion del periodo</li>
              <li>Contactos operativos</li>
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
