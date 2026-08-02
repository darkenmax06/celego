"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { usePersistentState } from "@/lib/use-persistent-state";

type Tab = "UPCOMING" | "OVERDUE";
type Messenger = { id: string; nombre: string };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type Row = {
  id: string; productType: "CREDITO" | "DEBITO"; identifier: string; tc: string; requestNumber: string;
  status: string; slaDueDate: string | null; dispatchDate: string | null; provincia: string; zona: string;
  urgent: boolean; nombre: string; cedula: string; direccion: string; telefonos: string; mensajero: string;
  diasRestantes: number | null; diasVencidos: number;
};
type Payload = { messengers: Messenger[]; rows: Row[]; total: number; warningBusinessDays: number; totalsByProduct: Record<string, number>; pagination: Pagination };

const EXPORT_COLUMNS = [
  ["producto", "Producto"], ["identificador", "Identificador"], ["numeroTarjeta", "Numero tarjeta"], ["numeroSolicitud", "Numero solicitud"],
  ["nombre", "Cliente"], ["cedula", "Cedula"], ["status", "Status"], ["slaDueDate", "SLA vence"], ["diasRestantes", "Dias restantes"],
  ["diasVencidos", "Dias vencidos"], ["dispatchDate", "Fecha despacho"], ["mensajero", "Mensajero"], ["provincia", "Provincia"], ["zona", "Zona"],
  ["urgente", "Urgente"], ["direccion", "Direccion"], ["telefonos", "Contactos"],
] as const;
type ExportColumn = (typeof EXPORT_COLUMNS)[number][0];
const DEFAULT_COLUMNS: ExportColumn[] = ["producto", "identificador", "nombre", "cedula", "status", "slaDueDate", "diasRestantes", "mensajero", "provincia", "zona"];

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("es-DO") : "-";
}

function timeBand(days: number | null) {
  if (days === null) return "Sin SLA";
  if (days < 0) return `Vencida ${Math.abs(days)} d`;
  if (days === 0) return "Hoy";
  return `${days} d`;
}

export default function SlaVencidasClient() {
  const [tab, setTab] = usePersistentState<Tab>("vencimientos:tab", "UPCOMING");
  const [productType, setProductType] = usePersistentState("vencimientos:producto", "ALL");
  const [messengerId, setMessengerId] = usePersistentState("vencimientos:mensajero", "ALL");
  const [q, setQ] = usePersistentState("vencimientos:busqueda", "");
  const [page, setPage] = usePersistentState("vencimientos:pagina", 1);
  const [rows, setRows] = useState<Row[]>([]);
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [warningDays, setWarningDays] = useState(3);
  const [totalsByProduct, setTotalsByProduct] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exportColumns, setExportColumns] = usePersistentState<ExportColumn[]>("vencimientos:columnas", DEFAULT_COLUMNS);

  const params = useMemo(() => {
    const next = new URLSearchParams({ tab, productType, messengerId, page: String(page), pageSize: "25" });
    if (q.trim()) next.set("q", q.trim());
    return next;
  }, [messengerId, page, productType, q, tab]);

  async function loadData() {
    setLoading(true);
    const res = await fetch(`/api/sla-vencidas?${params.toString()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ error: "No se pudo cargar vencimientos" }));
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo cargar vencimientos");
      setLoading(false);
      return;
    }
    setRows(data.rows ?? []); setMessengers(data.messengers ?? []); setPagination(data.pagination); setWarningDays(data.warningBusinessDays ?? 3); setTotalsByProduct(data.totalsByProduct ?? {});
    if (page > data.pagination.totalPages) setPage(data.pagination.totalPages);
    setMessage(""); setLoading(false);
  }

  useEffect(() => { void loadData(); }, [params]);

  function changeTab(next: Tab) { setTab(next); setPage(1); }
  function changeProduct(next: string) { setProductType(next); setPage(1); }
  function changeMessenger(next: string) { setMessengerId(next); setPage(1); }
  function toggleColumn(key: ExportColumn) { setExportColumns((previous) => previous.includes(key) ? (previous.length > 1 ? previous.filter((column) => column !== key) : previous) : [...previous, key]); }

  async function exportList(format: "csv" | "xlsx" | "pdf") {
    const res = await fetch("/api/sla-vencidas/export-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tab, productType: productType === "ALL" ? undefined : productType, messengerId, q, columns: exportColumns, format }) });
    if (!res.ok) { const data = await res.json().catch(() => ({ error: "No se pudo exportar" })); setMessage(data.error ?? "No se pudo exportar"); return; }
    const url = URL.createObjectURL(await res.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `vencimientos-${tab.toLowerCase()}.${format}`; anchor.click(); URL.revokeObjectURL(url);
    setMessage(`Listado exportado en ${format.toUpperCase()}`);
  }

  async function exportJpgZip() {
    if (tab !== "OVERDUE") { setMessage("Las fichas JPG solo aplican a tarjetas vencidas."); return; }
    const query = new URLSearchParams({ messengerId, productType });
    const res = await fetch(`/api/sla-vencidas/export?${query.toString()}`);
    if (!res.ok) { const data = await res.json().catch(() => ({ error: "No se pudo exportar" })); setMessage(data.error ?? "No se pudo exportar"); return; }
    const url = URL.createObjectURL(await res.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "vencimientos-vencidos.zip"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div>
    <PageHeader title="Vencimientos" subtitle="Prioriza despachos próximos a vencer y atrasados de crédito y débito." />
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => changeTab("UPCOMING")} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${tab === "UPCOMING" ? "border-blue-700 bg-blue-50 text-blue-700" : "border-slate-300"}`}>Próximas</button>
        <button type="button" onClick={() => changeTab("OVERDUE")} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${tab === "OVERDUE" ? "border-rose-700 bg-rose-50 text-rose-700" : "border-slate-300"}`}>Vencidas</button>
        <select value={productType} onChange={(event) => changeProduct(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="ALL">Todos los productos</option><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option></select>
        <select value={messengerId} onChange={(event) => changeMessenger(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="ALL">Todos los mensajeros</option>{messengers.map((messenger) => <option key={messenger.id} value={messenger.id}>{messenger.nombre}</option>)}</select>
        <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Tarjeta, solicitud, cédula o cliente" className="min-w-56 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void loadData()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Actualizar</button>
      </div>
      <div className={`mt-3 grid gap-2 text-xs sm:grid-cols-4 ${tab === "OVERDUE" ? "text-rose-800" : "text-blue-800"}`}>
        <div className="rounded-lg border border-current/15 bg-current/5 px-3 py-2">{tab === "UPCOMING" ? `Ventana: hoy a ${warningDays} días laborables` : "SLA vencido"}</div>
        <div className="rounded-lg border border-current/15 bg-current/5 px-3 py-2">Total: {pagination.total}</div>
        <div className="rounded-lg border border-current/15 bg-current/5 px-3 py-2">Crédito: {totalsByProduct.CREDITO ?? 0}</div>
        <div className="rounded-lg border border-current/15 bg-current/5 px-3 py-2">Débito: {totalsByProduct.DEBITO ?? 0}</div>
      </div>
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
    </Panel>
    <Panel className="mt-5" title="Exportar listado">
      <div className="flex flex-wrap gap-2">{(["csv", "xlsx", "pdf"] as const).map((format) => <button key={format} type="button" onClick={() => void exportList(format)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">{format.toUpperCase()}</button>)}<button type="button" disabled={tab !== "OVERDUE"} onClick={() => void exportJpgZip()} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Fichas JPG (ZIP)</button></div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">{EXPORT_COLUMNS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={exportColumns.includes(key)} onChange={() => toggleColumn(key)} />{label}</label>)}</div>
    </Panel>
    <Panel className="mt-5" title={loading ? "Cargando..." : `${tab === "UPCOMING" ? "Próximas a vencer" : "Vencidas"} (${pagination.total})`}>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-2">Producto</th><th className="pb-2">Identificador</th><th className="pb-2">Cliente</th><th className="pb-2">Despacho</th><th className="pb-2">SLA</th><th className="pb-2">Banda</th><th className="pb-2">Estado</th><th className="pb-2">Mensajero</th><th className="pb-2">Provincia / Zona</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.productType === "DEBITO" ? "bg-cyan-100 text-cyan-800" : "bg-blue-100 text-blue-800"}`}>{row.productType}</span></td><td className="py-2 font-medium">{row.identifier}</td><td className="py-2"><p>{row.nombre}</p><p className="text-xs text-slate-500">{row.cedula}</p></td><td className="py-2">{dateLabel(row.dispatchDate)}</td><td className="py-2">{dateLabel(row.slaDueDate)}</td><td className={`py-2 font-semibold ${row.diasRestantes !== null && row.diasRestantes < 0 ? "text-rose-700" : "text-amber-700"}`}>{timeBand(row.diasRestantes)}</td><td className="py-2"><StatusBadge value={row.status} /></td><td className="py-2">{row.mensajero || "SIN ASIGNAR"}</td><td className="py-2">{row.provincia}<span className="text-slate-400"> / </span>{row.zona}</td></tr>)}{!rows.length ? <tr><td colSpan={9} className="py-8 text-center text-sm text-slate-500">{loading ? "Cargando..." : "No hay tarjetas para estos filtros."}</td></tr> : null}</tbody></table></div>
      <div className="mt-4 flex items-center justify-between text-sm"><span>Página {pagination.page} de {pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={pagination.page <= 1} onClick={() => setPage(Math.max(1, pagination.page - 1))} className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40">Anterior</button><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(Math.min(pagination.totalPages, pagination.page + 1))} className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40">Siguiente</button></div></div>
    </Panel>
  </div>;
}
