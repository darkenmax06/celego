"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

type MessengerOption = {
  id: string;
  nombre: string;
};

type Row = {
  id: string;
  tc: string;
  status: string;
  slaDueDate: string | null;
  dispatchDate: string | null;
  provincia: string;
  zona: string;
  nombre: string;
  cedula: string;
  direccion: string;
  telefonos: string;
  mensajero: string;
  mensajeroId: string;
  diasVencidos: number;
};

type Payload = {
  filters: { messengerId: string };
  messengers: MessengerOption[];
  total: number;
  rows: Row[];
};

function dateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-DO");
}

export default function SlaVencidasClient() {
  const [messengerId, setMessengerId] = useState("ALL");
  const [messengers, setMessengers] = useState<MessengerOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadData(nextMessengerId = messengerId) {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextMessengerId && nextMessengerId !== "ALL") {
      params.set("messengerId", nextMessengerId);
    }
    const query = params.toString();
    const res = await fetch(`/api/sla-vencidas${query ? `?${query}` : ""}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({ error: "No se pudo cargar SLA vencidas" }))) as
      | Payload
      | { error: string };

    if (!res.ok || "error" in json) {
      setMessage(("error" in json && json.error) || "No se pudo cargar SLA vencidas");
      setLoading(false);
      return;
    }

    setMessengers(json.messengers ?? []);
    setRows(json.rows ?? []);
    setMessage("");
    setLoading(false);
  }

  useEffect(() => {
    void loadData("ALL");
  }, []);

  async function exportJpgZip() {
    const params = new URLSearchParams();
    if (messengerId !== "ALL") {
      params.set("messengerId", messengerId);
    }
    const res = await fetch(`/api/sla-vencidas/export?${params.toString()}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar imagenes" }));
      setMessage(json.error ?? "No se pudo exportar imagenes");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sla-vencidas-${messengerId === "ALL" ? "general" : messengerId}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Export JPG generado");
  }

  return (
    <div>
      <PageHeader
        title="Tarjetas con SLA vencidas"
        subtitle="Filtra por mensajero y exporta imagenes JPG con nombre, direccion y contactos"
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={messengerId}
            onChange={(event) => {
              const next = event.target.value;
              setMessengerId(next);
              void loadData(next);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="ALL">Todos los mensajeros</option>
            {messengers.map((messenger) => (
              <option key={messenger.id} value={messenger.id}>
                {messenger.nombre}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => void exportJpgZip()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Exportar JPG (ZIP)
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          Total vencidas: {rows.length}
        </div>
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel className="mt-5" title={loading ? "Cargando..." : `Listado (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">TC / Cedula</th>
                <th className="pb-2">Mensajero</th>
                <th className="pb-2">Provincia</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">SLA</th>
                <th className="pb-2">Vencida</th>
                <th className="pb-2">Direccion</th>
                <th className="pb-2">Contactos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 font-semibold text-slate-900">{row.nombre}</td>
                  <td className="py-2">
                    <p>{row.tc}</p>
                    <p className="text-xs text-slate-500">{row.cedula}</p>
                  </td>
                  <td className="py-2">{row.mensajero || "SIN ASIGNAR"}</td>
                  <td className="py-2">{row.provincia || row.zona}</td>
                  <td className="py-2">
                    <StatusBadge value={row.status} />
                  </td>
                  <td className="py-2">{dateLabel(row.slaDueDate)}</td>
                  <td className="py-2 text-rose-700">{row.diasVencidos} dia(s)</td>
                  <td className="py-2">{row.direccion || "-"}</td>
                  <td className="py-2">{row.telefonos || "-"}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-slate-500">
                    {loading ? "Cargando..." : "No hay tarjetas SLA vencidas para este filtro."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
