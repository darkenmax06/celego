"use client";

import { useEffect, useState } from "react";
import { Download, CheckCircle, XCircle, Clock, Send, RefreshCw, Search } from "lucide-react";

export type SLAExtensionRequestItem = {
  id: string;
  cardId: string;
  tc: string;
  cedula: string;
  nombre: string;
  provinciaOrigen: string;
  provinciaDestino: string | null;
  motivo: string;
  diasSolicitados: number;
  status: "PENDIENTE" | "ENVIADA_BANCO" | "APROBADA" | "RECHAZADA";
  cardStatus: string | null;
  slaDueDate: string | null;
  mensajero: string;
  solicitadoPor: string;
  aprobadoPor: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  isAdmin?: boolean;
};

export function SLAExtensionRequestsTable({ isAdmin = true }: Props) {
  const [requests, setRequests] = useState<SLAExtensionRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  async function loadRequests() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (search.trim()) params.set("q", search.trim());

    try {
      const res = await fetch(`/api/operativo/extensiones-sla?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
      }
    } catch {
      setMessage("Error al cargar solicitudes de extensión de SLA");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, [statusFilter]);

  async function handleUpdateStatus(
    id: string,
    status: "PENDIENTE" | "ENVIADA_BANCO" | "APROBADA" | "RECHAZADA",
  ) {
    try {
      const res = await fetch("/api/operativo/extensiones-sla", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage(`Solicitud marcada como ${status}`);
        await loadRequests();
      } else {
        setMessage(json.error || "No se pudo actualizar la solicitud");
      }
    } catch {
      setMessage("Error de conexión al actualizar solicitud");
    }
  }

  async function handleExport(format: "xlsx" | "csv" | "pdf") {
    setExporting(true);
    setMessage("");
    try {
      const res = await fetch("/api/operativo/extensiones-sla/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusFilter, format }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Error al exportar" }));
        setMessage(json.error || "Error al exportar");
        setExporting(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `solicitudes-extension-sla.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exportado correctamente en formato ${format.toUpperCase()}`);
    } catch {
      setMessage("Error al descargar exportación");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void loadRequests()}
              placeholder="Buscar TC, cédula, cliente o motivo..."
              className="rounded-xl border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden min-w-[260px]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-hidden"
          >
            <option value="ALL">Todos los Estados</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="ENVIADA_BANCO">Enviadas al Banco</option>
            <option value="APROBADA">Aprobadas</option>
            <option value="RECHAZADA">Rechazadas</option>
          </select>

          <button
            type="button"
            onClick={() => void loadRequests()}
            className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* EXPORT BUTTONS FOR ROLE 1 (ADMIN / BANCO) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium mr-1">Exportar para Banco:</span>
          <button
            type="button"
            onClick={() => handleExport("xlsx")}
            disabled={exporting}
            className="flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={exporting}
            className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={exporting}
            className="flex items-center gap-1 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      {message ? <p className="text-xs font-semibold text-emerald-700 px-1">{message}</p> : null}

      {/* TABLE */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50/80 uppercase tracking-wider text-slate-500 font-bold">
            <tr>
              <th className="px-4 py-3">Cliente / Cédula</th>
              <th className="px-4 py-3">TC</th>
              <th className="px-4 py-3">Origen → Destino</th>
              <th className="px-4 py-3">Motivo Extensión</th>
              <th className="px-4 py-3 text-center">Días</th>
              <th className="px-4 py-3">Estado Solicitud</th>
              <th className="px-4 py-3">Fecha Solicitud</th>
              {isAdmin ? <th className="px-4 py-3 text-right">Acciones Rol 1</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-900">{item.nombre}</p>
                  <p className="font-mono text-[11px] text-slate-500">{item.cedula}</p>
                </td>
                <td className="px-4 py-3 font-mono font-bold text-blue-700">{item.tc}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-slate-700">{item.provinciaOrigen}</span>
                  {item.provinciaDestino ? (
                    <span className="text-indigo-700 font-bold"> → {item.provinciaDestino}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 max-w-xs text-slate-700">
                  <p className="truncate" title={item.motivo}>
                    {item.motivo}
                  </p>
                  <span className="text-[10px] text-slate-400">Por: {item.solicitadoPor}</span>
                </td>
                <td className="px-4 py-3 text-center font-bold text-slate-900">
                  +{item.diasSolicitados}d
                </td>
                <td className="px-4 py-3">
                  {item.status === "APROBADA" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                      <CheckCircle className="h-3 w-3" /> Aprobada
                    </span>
                  ) : item.status === "ENVIADA_BANCO" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 font-bold text-blue-800">
                      <Send className="h-3 w-3" /> Enviada al Banco
                    </span>
                  ) : item.status === "RECHAZADA" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 font-bold text-rose-800">
                      <XCircle className="h-3 w-3" /> Rechazada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                      <Clock className="h-3 w-3" /> Pendiente
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {new Date(item.createdAt).toLocaleDateString("es-DO")}
                </td>
                {isAdmin ? (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      {item.status === "PENDIENTE" ? (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(item.id, "ENVIADA_BANCO")}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                        >
                          Marcar Enviada
                        </button>
                      ) : null}
                      {item.status !== "APROBADA" ? (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(item.id, "APROBADA")}
                          className="rounded-lg bg-emerald-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-800"
                        >
                          Aprobar
                        </button>
                      ) : null}
                      {item.status !== "RECHAZADA" && item.status !== "APROBADA" ? (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(item.id, "RECHAZADA")}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                        >
                          Rechazar
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {!requests.length ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-slate-400">
                  {loading ? "Cargando solicitudes..." : "No hay solicitudes de extensión de SLA con los filtros seleccionados."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
