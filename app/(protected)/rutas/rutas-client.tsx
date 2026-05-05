"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

type Messenger = { id: string; nombre: string };
type ProvinceRow = { id: string; nombre: string; zona: string; active: boolean };
type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };

type RouteItem = {
  id: string;
  sequence: number;
  checkedAt: string | null;
  card: {
    id: string;
    tc: string;
    provincia: string;
    zona: string;
    status: string;
    returnReason: string | null;
    metadata: unknown;
    customer: { nombre: string; cedula: string };
  };
};

type RouteRow = {
  id: string;
  fecha: string;
  status: string;
  notas: string | null;
  messenger: Messenger;
  items: RouteItem[];
};

type LotItem = {
  id: string;
  cardId: string | null;
  tc: string;
  cedula: string | null;
  telefono: string | null;
  recibida: string | null;
  retornada: string | null;
  card: {
    id: string;
    status: string;
    returnReason: string | null;
    metadata?: unknown;
    customer: { nombre: string; cedula: string };
  } | null;
};

type LotRow = {
  id: string;
  lotNumber: string;
  enviadoA: string;
  sentTo: string | null;
  fechaEnvio: string;
  fechaRetorno: string | null;
  estatus: string;
  notas: string | null;
  items: LotItem[];
  stats: {
    total: number;
    recibidas: number;
    retornadas: number;
    pendientes: number;
  };
};

type ScanResult = {
  tc: string;
  cedula: string;
  nombre: string;
};

type ModuleTab = "operativo" | "lotes";
type LotTab = "lotes" | "seguimiento";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-DO");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getRouteLifecycle(item: RouteItem) {
  const root = asRecord(item.card.metadata);
  const route = asRecord(root.route);
  const value = typeof route.result === "string" ? route.result : "EN_RUTA";
  if (value === "ACUSE_RECIBIDO") return "ACUSE RECIBIDO";
  if (value === "DEVUELTA_TIENDA") return "DEVUELTA A TIENDA";
  return "EN RUTA";
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replaceAll("\"", "\"\"")}"`;
    }
    return str;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key] ?? "")).join(","))].join("\n");
}

export default function RutasClient() {
  const [moduleTab, setModuleTab] = useState<ModuleTab>("operativo");
  const [lotTab, setLotTab] = useState<LotTab>("lotes");

  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [provinces, setProvinces] = useState<ProvinceRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [routesPagination, setRoutesPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [lotsPagination, setLotsPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [routePage, setRoutePage] = useState(1);
  const [lotPage, setLotPage] = useState(1);

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [messengerId, setMessengerId] = useState("");
  const [identifiers, setIdentifiers] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedRouteForLot, setSelectedRouteForLot] = useState<string | null>(null);
  const [selectedLotTrackingId, setSelectedLotTrackingId] = useState<string | null>(null);

  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanStatus, setScanStatus] = useState<"EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA">("ACUSE_RECIBIDO");
  const [scanComment, setScanComment] = useState("");

  const [showNewLot, setShowNewLot] = useState(false);
  const [lotMessengerId, setLotMessengerId] = useState("");
  const [lotDestinationProvince, setLotDestinationProvince] = useState("");
  const [lotFechaEnvio, setLotFechaEnvio] = useState(new Date().toISOString().slice(0, 10));
  const [lotIdentifiers, setLotIdentifiers] = useState("");

  const [message, setMessage] = useState("");
  const [savingNewLot, setSavingNewLot] = useState(false);

  async function loadMessengers() {
    const res = await fetch("/api/mensajeros", { cache: "no-store" });
    const json = await res.json();
    const list = json.messengers ?? [];
    setMessengers(list);
    if (!messengerId && list[0]) {
      setMessengerId(list[0].id);
    }
    if (!lotMessengerId && list[0]) {
      setLotMessengerId(list[0].id);
    }
  }

  async function loadProvinces() {
    const res = await fetch("/api/config/provincias", { cache: "no-store" });
    const json = await res.json();
    const list = (json.provincias ?? []).filter((item: ProvinceRow) => item.active);
    setProvinces(list);
    if (!lotDestinationProvince && list[0]) {
      setLotDestinationProvince(list[0].nombre);
    }
  }

  async function loadRoutes(pageArg = routePage) {
    const params = new URLSearchParams({
      date: fecha,
      page: String(pageArg),
      pageSize: String(routesPagination.pageSize),
    });
    const res = await fetch(`/api/rutas?${params.toString()}`, { cache: "no-store" });
    const json = await res.json();
    const list = json.routes ?? [];
    const pagination = json.pagination as PaginationMeta | undefined;
    setRoutes(list);
    if (pagination) {
      setRoutesPagination(pagination);
      if (pageArg > pagination.totalPages) {
        setRoutePage(pagination.totalPages);
      }
    }
    if (list.length) {
      const stillExists = list.some((item: RouteRow) => item.id === selectedRouteId);
      if (!stillExists) {
        setSelectedRouteId(list[0].id);
      }
    } else {
      setSelectedRouteId("");
    }
  }

  async function loadLots(pageArg = lotPage) {
    const params = new URLSearchParams({
      date: fecha,
      page: String(pageArg),
      pageSize: String(lotsPagination.pageSize),
    });
    const res = await fetch(`/api/lotes?${params.toString()}`, { cache: "no-store" });
    const json = await res.json();
    const pagination = json.pagination as PaginationMeta | undefined;
    setLots(json.lots ?? []);
    if (pagination) {
      setLotsPagination(pagination);
      if (pageArg > pagination.totalPages) {
        setLotPage(pagination.totalPages);
      }
    }
  }

  useEffect(() => {
    void Promise.all([loadMessengers(), loadProvinces()]);
  }, []);

  useEffect(() => {
    setRoutePage(1);
    setLotPage(1);
  }, [fecha]);

  useEffect(() => {
    void loadRoutes(routePage);
  }, [fecha, routePage]);

  useEffect(() => {
    void loadLots(lotPage);
  }, [fecha, lotPage]);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const selectedRouteLot = useMemo(
    () => routes.find((route) => route.id === selectedRouteForLot) ?? null,
    [routes, selectedRouteForLot],
  );

  const selectedLotTracking = useMemo(
    () => lots.find((lot) => lot.id === selectedLotTrackingId) ?? null,
    [lots, selectedLotTrackingId],
  );

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = identifiers
      .split(/[\n,;]+/g)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!parsed.length) {
      setMessage("Ingresa al menos un TC/Cedula/Referencia");
      return;
    }

    const res = await fetch("/api/rutas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha,
        messengerId,
        identifiers: parsed,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo crear ruta");
      return;
    }

    setMessage(`Ruta creada con ${data.route.items.length} tarjetas`);
    setIdentifiers("");
    setRoutePage(1);
    await loadRoutes(1);
    setSelectedRouteId(data.route.id);
  }

  async function exportRoute(format: "pdf" | "xlsx") {
    if (!selectedRoute) {
      setMessage("Selecciona una ruta para exportar");
      return;
    }

    const res = await fetch(`/api/rutas/export?routeId=${selectedRoute.id}&format=${format}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar ruta" }));
      setMessage(json.error ?? "No se pudo exportar ruta");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ruta-${selectedRoute.id.slice(-6)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Ruta exportada en ${format.toUpperCase()}`);
  }

  async function scanCard() {
    if (!selectedRoute) {
      setMessage("Selecciona una ruta para pistolear");
      return;
    }
    const identifier = scanInput.trim();
    if (!identifier) return;
    if (scanStatus === "DEVUELTA_TIENDA" && !scanComment.trim()) {
      setMessage("Debes indicar el motivo para marcar Devuelta a tienda");
      return;
    }

    const res = await fetch("/api/rutas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SCAN_ITEM",
        routeId: selectedRoute.id,
        identifier,
        result: scanStatus,
        comentario: scanComment || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo pistolear");
      return;
    }

    setScanResult(data.scanned);
    setScanInput("");
    setScanComment("");
    setMessage(`Tarjeta ${data.scanned.tc} actualizada a ${scanStatus}`);
    await Promise.all([loadRoutes(routePage), loadLots(lotPage)]);
  }

  async function markRouteItem(
    itemId: string,
    result: "EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA",
    comentario?: string,
  ) {
    const res = await fetch("/api/rutas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "UPDATE_ITEM_RESULT",
        itemId,
        result,
        comentario,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo actualizar tarjeta de ruta");
      return;
    }
    setMessage(`Tarjeta marcada como ${result}`);
    await Promise.all([loadRoutes(routePage), loadLots(lotPage)]);
  }

  async function markLotTrackingItem(
    lotItemId: string,
    result: "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA" | "EN_RUTA",
    comentario?: string,
  ) {
    const res = await fetch("/api/lotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "UPDATE_ITEM_RESULT",
        lotItemId,
        result,
        comentario,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo actualizar item de lote");
      return;
    }
    setMessage(
      `Item de lote actualizado: ${
        result === "ACUSE_RECIBIDO"
          ? "ACUSE RECIBIDO"
          : result === "DEVUELTA_TIENDA"
            ? "DEVUELTA A TIENDA"
            : "EN RUTA"
      }`,
    );
    await Promise.all([loadRoutes(routePage), loadLots(lotPage)]);
  }

  async function createLot() {
    setSavingNewLot(true);
    if (!lotMessengerId || !lotDestinationProvince) {
      setMessage("Selecciona mensajero y provincia destino");
      setSavingNewLot(false);
      return;
    }
    const parsedIdentifiers = lotIdentifiers
      .split(/[\n,;]+/g)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!parsedIdentifiers.length) {
      setMessage("Debes indicar al menos una tarjeta para el lote");
      setSavingNewLot(false);
      return;
    }

    const res = await fetch("/api/lotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messengerId: lotMessengerId,
        sentTo: lotDestinationProvince,
        fechaEnvio: lotFechaEnvio,
        identifiers: parsedIdentifiers,
        estatus: "EN TRANSITO",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo crear lote");
      setSavingNewLot(false);
      return;
    }

    setSavingNewLot(false);
    setShowNewLot(false);
    setLotIdentifiers("");
    setMessage(`Lote ${data.lot?.lotNumber ?? ""} creado`);
    await loadLots(lotPage);
  }

  function exportLotTrackingCsv() {
    const rows = lots.map((lot) => ({
      lote: lot.lotNumber,
      enviadoA: lot.enviadoA,
      provincia: lot.sentTo ?? "",
      fechaEnvio: formatDate(lot.fechaEnvio),
      fechaRetorno: formatDate(lot.fechaRetorno),
      estatus: lot.estatus,
      total: lot.stats.total,
      recibidas: lot.stats.recibidas,
      retornadas: lot.stats.retornadas,
      pendientes: lot.stats.pendientes,
    }));

    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seguimiento-lotes-${fecha}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Seguimiento de lotes exportado en CSV");
  }

  function onScanKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void scanCard();
    }
  }

  const routeStats = useMemo(() => {
    if (!selectedRoute) return { total: 0, procesadas: 0, entregadas: 0, retornadas: 0 };
    const total = selectedRoute.items.length;
    const procesadas = selectedRoute.items.filter((item) => item.checkedAt).length;
    const entregadas = selectedRoute.items.filter((item) => getRouteLifecycle(item) === "ACUSE RECIBIDO").length;
    const retornadas = selectedRoute.items.filter((item) => getRouteLifecycle(item) === "DEVUELTA A TIENDA").length;
    return { total, procesadas, entregadas, retornadas };
  }, [selectedRoute]);

  function requestReturnReason(existing?: string | null) {
    const value = window.prompt("Indica el motivo de devolucion", existing?.trim() ?? "");
    if (value === null) return null;
    const trimmed = value.trim();
    if (!trimmed) {
      setMessage("Debes indicar motivo de devolucion para marcar tarjeta retornada");
      return "";
    }
    return trimmed;
  }

  return (
    <div>
      <PageHeader
        title="Rutas"
        subtitle="Asignacion de rutas, lotes y gestion de acuses de mensajeros"
      />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setModuleTab("operativo")}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
            moduleTab === "operativo"
              ? "border-blue-700 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          Operativo de rutas
        </button>
        <button
          onClick={() => setModuleTab("lotes")}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
            moduleTab === "lotes"
              ? "border-blue-700 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          Lotes
        </button>
      </div>

      {moduleTab === "operativo" ? (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Panel title="Crear ruta diaria">
            <form className="space-y-3" onSubmit={createRoute}>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Fecha</label>
                <input
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  type="date"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Mensajero</label>
                <select
                  value={messengerId}
                  onChange={(event) => setMessengerId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {messengers.map((messenger) => (
                    <option key={messenger.id} value={messenger.id}>
                      {messenger.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Cedulas/TC/Referencias
                </label>
                <textarea
                  value={identifiers}
                  onChange={(event) => setIdentifiers(event.target.value)}
                  rows={7}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Una por linea o separadas por coma"
                />
              </div>
              <button className="w-full rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white">
                Crear ruta
              </button>
            </form>

          </Panel>

          <Panel title="Pistoleo y gestion de acuses">
            {!selectedRoute ? (
              <div>
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Rutas del dia</label>
                  <select
                    value={selectedRouteId}
                    onChange={(event) => setSelectedRouteId(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.messenger.nombre} - {formatDate(route.fecha)} ({route.items.length} tarjetas)
                      </option>
                    ))}
                  </select>
                </div>
                <ListPager
                  page={routesPagination.page}
                  totalPages={routesPagination.totalPages}
                  total={routesPagination.total}
                  onPrev={() => setRoutePage((prev) => Math.max(1, prev - 1))}
                  onNext={() =>
                    setRoutePage((prev) => Math.min(routesPagination.totalPages, prev + 1))
                  }
                />
                <p className="text-sm text-slate-500">Selecciona o crea una ruta para gestionar.</p>
              </div>
            ) : (
              <div>
                <div className="mb-4 grid gap-3 sm:grid-cols-4">
                  <Stat label="Total" value={routeStats.total} />
                  <Stat label="Procesadas" value={routeStats.procesadas} />
                  <Stat label="Acuses recibidos" value={routeStats.entregadas} />
                  <Stat label="Devueltas tienda" value={routeStats.retornadas} />
                </div>

                <div className="mb-4 rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">
                        {selectedRoute.messenger.nombre} - {formatDate(selectedRoute.fecha)}
                      </p>
                      <StatusBadge value={selectedRoute.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs uppercase tracking-wide text-slate-500">Ruta</label>
                      <select
                        value={selectedRouteId}
                        onChange={(event) => setSelectedRouteId(event.target.value)}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      >
                        {routes.map((route) => (
                          <option key={route.id} value={route.id}>
                            {route.messenger.nombre} - {formatDate(route.fecha)} ({route.items.length})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => void exportRoute("pdf")}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      >
                        Exportar PDF
                      </button>
                      <button
                        onClick={() => void exportRoute("xlsx")}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      >
                        Exportar Excel
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-[1fr_170px_1fr_auto]">
                    <input
                      value={scanInput}
                      onChange={(event) => setScanInput(event.target.value)}
                      onKeyDown={onScanKeyDown}
                      placeholder="Pistolear TC o Cedula"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={scanStatus}
                      onChange={(event) => setScanStatus(event.target.value as typeof scanStatus)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="ACUSE_RECIBIDO">Marcar Acuse recibido</option>
                      <option value="DEVUELTA_TIENDA">Marcar Devuelta a tienda</option>
                      <option value="EN_RUTA">Mantener En Ruta</option>
                    </select>
                    <input
                      value={scanComment}
                      onChange={(event) => setScanComment(event.target.value)}
                      placeholder="Comentario (si aplica)"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => void scanCard()}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Pistolear
                    </button>
                  </div>

                  {scanResult ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      Ultima tarjeta pistoleada: {scanResult.tc} - {scanResult.nombre} ({scanResult.cedula})
                    </p>
                  ) : null}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="pb-2">#</th>
                        <th className="pb-2">TC</th>
                        <th className="pb-2">Cliente</th>
                        <th className="pb-2">Cedula</th>
                        <th className="pb-2">Provincia</th>
                        <th className="pb-2">Estado</th>
                        <th className="pb-2">Pistoleada</th>
                        <th className="pb-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRoute.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="py-2 text-slate-400">{item.sequence}</td>
                          <td className="py-2 font-medium">{item.card.tc}</td>
                          <td className="py-2">{item.card.customer.nombre}</td>
                          <td className="py-2">{item.card.customer.cedula}</td>
                        <td className="py-2">{item.card.provincia}</td>
                        <td className="py-2">
                          <StatusBadge value={getRouteLifecycle(item)} />
                        </td>
                          <td className="py-2">
                            {item.checkedAt ? new Date(item.checkedAt).toLocaleTimeString("es-DO") : "-"}
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => void markRouteItem(item.id, "ACUSE_RECIBIDO")}
                              className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                            >
                              Acuse recibido
                            </button>
                            <button
                              onClick={() => {
                                const reason = requestReturnReason(item.card.returnReason);
                                if (!reason) return;
                                void markRouteItem(item.id, "DEVUELTA_TIENDA", reason);
                              }}
                              className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                            >
                              Devuelta tienda
                            </button>
                          </div>
                          </td>
                        </tr>
                      ))}
                      {!selectedRoute.items.length ? (
                        <tr>
                          <td colSpan={8} className="py-4 text-sm text-slate-500">
                            Esta ruta no tiene tarjetas.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3">
                  <ListPager
                    page={routesPagination.page}
                    totalPages={routesPagination.totalPages}
                    total={routesPagination.total}
                    onPrev={() => setRoutePage((prev) => Math.max(1, prev - 1))}
                    onNext={() =>
                      setRoutePage((prev) => Math.min(routesPagination.totalPages, prev + 1))
                    }
                  />
                </div>
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {moduleTab === "lotes" ? (
        <div>
          <Panel>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-lg font-bold text-slate-900">Lotes</p>
                <p className="text-xs text-slate-500">Gestion de envios a mensajeros y seguimiento</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={exportLotTrackingCsv}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  Exportar
                </button>
                <button
                  onClick={() => setShowNewLot(true)}
                  className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white"
                >
                  + Nuevo lote
                </button>
              </div>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setLotTab("lotes")}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                  lotTab === "lotes"
                    ? "border-blue-700 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                Lotes activos
              </button>
              <button
                onClick={() => setLotTab("seguimiento")}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                  lotTab === "seguimiento"
                    ? "border-blue-700 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                Seguimiento de lotes
              </button>
            </div>

            {lotTab === "lotes" ? (
              <div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {routes.map((route) => {
                  const total = route.items.length;
                  const recibidas = route.items.filter((item) => getRouteLifecycle(item) === "ACUSE RECIBIDO").length;
                  const retornadas = route.items.filter((item) => getRouteLifecycle(item) === "DEVUELTA A TIENDA").length;
                  const percent = total ? Math.round(((recibidas + retornadas) / total) * 100) : 0;

                  return (
                    <article key={route.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-display text-xs font-bold tracking-wide text-blue-700">
                          LOTE {route.id.slice(-5).toUpperCase()}
                        </p>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          {percent}% procesado
                        </span>
                      </div>
                      <p className="font-display text-base font-bold text-slate-900">{route.messenger.nombre}</p>
                      <p className="text-xs text-slate-500">{formatDate(route.fecha)}</p>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <MiniLotStat label="Total" value={total} color="text-slate-900" />
                        <MiniLotStat label="Acuses" value={recibidas} color="text-emerald-700" />
                        <MiniLotStat label="Devueltas" value={retornadas} color="text-rose-700" />
                      </div>

                      <div className="mt-3 h-1.5 rounded bg-slate-100">
                        <div className="h-full rounded bg-blue-700" style={{ width: `${percent}%` }} />
                      </div>

                      <button
                        onClick={() => setSelectedRouteForLot(route.id)}
                        className="mt-3 w-full rounded-lg bg-[#0f2544] px-3 py-2 text-sm font-semibold text-white"
                      >
                        Ver tarjetas
                      </button>
                    </article>
                  );
                  })}
                  {!routes.length ? <p className="text-sm text-slate-500">No hay lotes activos para la fecha.</p> : null}
                </div>
                <div className="mt-3">
                  <ListPager
                    page={routesPagination.page}
                    totalPages={routesPagination.totalPages}
                    total={routesPagination.total}
                    onPrev={() => setRoutePage((prev) => Math.max(1, prev - 1))}
                    onNext={() =>
                      setRoutePage((prev) => Math.min(routesPagination.totalPages, prev + 1))
                    }
                  />
                </div>
              </div>
            ) : null}

            {lotTab === "seguimiento" ? (
              <div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">No. lote</th>
                      <th className="px-3 py-2">Mensajero</th>
                      <th className="px-3 py-2">Provincia</th>
                      <th className="px-3 py-2">F. envio</th>
                      <th className="px-3 py-2">F. retorno</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((lot) => (
                      <tr key={lot.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-display text-xs font-bold text-blue-700">{lot.lotNumber}</td>
                        <td className="px-3 py-2">{lot.enviadoA}</td>
                        <td className="px-3 py-2">{lot.sentTo ?? "-"}</td>
                        <td className="px-3 py-2">{formatDate(lot.fechaEnvio)}</td>
                        <td className="px-3 py-2">{formatDate(lot.fechaRetorno)}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {lot.estatus}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => setSelectedLotTrackingId(lot.id)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!lots.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                          No hay lotes de seguimiento para la fecha.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                  </table>
                </div>
                <div className="mt-3">
                  <ListPager
                    page={lotsPagination.page}
                    totalPages={lotsPagination.totalPages}
                    total={lotsPagination.total}
                    onPrev={() => setLotPage((prev) => Math.max(1, prev - 1))}
                    onNext={() => setLotPage((prev) => Math.min(lotsPagination.totalPages, prev + 1))}
                  />
                </div>
              </div>
            ) : null}
          </Panel>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

      {selectedRouteLot ? (
        <RouteLotModal
          route={selectedRouteLot}
          onClose={() => setSelectedRouteForLot(null)}
          onMark={markRouteItem}
          onRequireReturnReason={requestReturnReason}
        />
      ) : null}

      {selectedLotTracking ? (
        <TrackingLotModal
          lot={selectedLotTracking}
          onClose={() => setSelectedLotTrackingId(null)}
          onMark={markLotTrackingItem}
          onRequireReturnReason={requestReturnReason}
        />
      ) : null}

      {showNewLot ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4 py-6" onClick={() => setShowNewLot(false)}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-slate-900">Nuevo lote</h3>
              <button onClick={() => setShowNewLot(false)} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                El número de lote se genera automáticamente al guardar.
              </p>
              <select
                value={lotMessengerId}
                onChange={(event) => setLotMessengerId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {!messengers.length ? <option value="">Sin mensajeros activos</option> : null}
                {messengers.map((messenger) => (
                  <option key={messenger.id} value={messenger.id}>
                    Mensajero: {messenger.nombre}
                  </option>
                ))}
              </select>
              <select
                value={lotDestinationProvince}
                onChange={(event) => setLotDestinationProvince(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {!provinces.length ? <option value="">Sin provincias configuradas</option> : null}
                {provinces.map((province) => (
                  <option key={province.id} value={province.nombre}>
                    Provincia destino: {province.nombre} ({province.zona})
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={lotFechaEnvio}
                onChange={(event) => setLotFechaEnvio(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
              <textarea
                value={lotIdentifiers}
                onChange={(event) => setLotIdentifiers(event.target.value)}
                rows={4}
                placeholder="Tarjetas del lote (TC/Cedula), una por linea"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowNewLot(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={() => void createLot()}
                disabled={savingNewLot || !lotMessengerId || !lotDestinationProvince}
                className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingNewLot ? "Creando..." : "Crear lote"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}

function MiniLotStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <p className={`font-display text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function ListPager({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
      <span>
        Página {page} de {totalPages} · {total} registros
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

function RouteLotModal({
  route,
  onClose,
  onMark,
  onRequireReturnReason,
}: {
  route: RouteRow;
  onClose: () => void;
  onMark: (
    itemId: string,
    result: "EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA",
    comentario?: string,
  ) => Promise<void>;
  onRequireReturnReason: (existing?: string | null) => string | null;
}) {
  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="font-display text-xs font-bold tracking-wide text-blue-700">LOTE {route.id.slice(-5).toUpperCase()}</p>
            <h3 className="font-display text-xl font-bold text-slate-900">{route.messenger.nombre}</h3>
            <p className="text-xs text-slate-500">{formatDate(route.fecha)}</p>
          </div>
          <button onClick={onClose} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-2 p-4 sm:grid-cols-4">
            <Stat label="Total" value={route.items.length} />
            <Stat label="Acuses" value={route.items.filter((item) => getRouteLifecycle(item) === "ACUSE RECIBIDO").length} />
            <Stat label="Devueltas" value={route.items.filter((item) => getRouteLifecycle(item) === "DEVUELTA A TIENDA").length} />
            <Stat label="Pendientes" value={route.items.filter((item) => getRouteLifecycle(item) === "EN RUTA").length} />
          </div>

          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">No. tarjeta</th>
                  <th className="px-3 py-2">Cedula</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-center">Acuse recibido</th>
                  <th className="px-3 py-2 text-center">Devuelta tienda</th>
                </tr>
              </thead>
              <tbody>
                {route.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-display text-xs font-semibold text-blue-700">{item.card.tc}</td>
                    <td className="px-3 py-2">{item.card.customer.cedula}</td>
                    <td className="px-3 py-2">{item.card.customer.nombre}</td>
                    <td className="px-3 py-2">
                      <StatusBadge value={getRouteLifecycle(item)} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={getRouteLifecycle(item) === "ACUSE RECIBIDO"}
                        onChange={(event) =>
                          void onMark(item.id, event.target.checked ? "ACUSE_RECIBIDO" : "EN_RUTA")
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={getRouteLifecycle(item) === "DEVUELTA A TIENDA"}
                        onChange={(event) => {
                          if (!event.target.checked) {
                            void onMark(item.id, "EN_RUTA");
                            return;
                          }
                          const reason = onRequireReturnReason(item.card.returnReason);
                          if (!reason) return;
                          void onMark(item.id, "DEVUELTA_TIENDA", reason);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackingLotModal({
  lot,
  onClose,
  onMark,
  onRequireReturnReason,
}: {
  lot: LotRow;
  onClose: () => void;
  onMark: (itemId: string, result: "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA" | "EN_RUTA", comentario?: string) => Promise<void>;
  onRequireReturnReason: (existing?: string | null) => string | null;
}) {
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState("");

  async function onScan(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = scanInput.trim();
    if (!value) return;

    const target = lot.items.find((item) => {
      const digits = value.replace(/\D/g, "");
      return (
        item.tc === value ||
        item.cedula === value ||
        (item.cedula?.replace(/\D/g, "") === digits && digits.length > 0)
      );
    });

    if (!target) {
      setScanResult("Tarjeta no encontrada en el lote");
      return;
    }

    await onMark(target.id, "ACUSE_RECIBIDO");
    setScanResult(`Tarjeta ${target.tc} marcada como acuse recibido`);
    setScanInput("");
  }

  return (
    <div className="fixed inset-0 z-[126] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="font-display text-xs font-bold tracking-wide text-blue-700">LOTE {lot.lotNumber}</p>
            <h3 className="font-display text-xl font-bold text-slate-900">{lot.enviadoA}</h3>
            <p className="text-xs text-slate-500">{lot.sentTo ?? "-"} · {formatDate(lot.fechaEnvio)}</p>
          </div>
          <button onClick={onClose} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">✕</button>
        </div>

        <div className="p-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-4">
            <Stat label="Total" value={lot.stats.total} />
            <Stat label="Acuses" value={lot.stats.recibidas} />
            <Stat label="Devueltas" value={lot.stats.retornadas} />
            <Stat label="Pendientes" value={lot.stats.pendientes} />
          </div>

          <div className="mb-3 rounded-xl border border-slate-200 p-3">
            <input
              value={scanInput}
              onChange={(event) => setScanInput(event.target.value)}
              onKeyDown={(event) => void onScan(event)}
              placeholder="Pistolear TC/Cedula y presionar Enter"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {scanResult ? <p className="mt-2 text-xs text-emerald-700">{scanResult}</p> : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">No. tarjeta</th>
                  <th className="px-3 py-2">Cedula</th>
                  <th className="px-3 py-2">Telefono</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2 text-center">Acuse recibido</th>
                  <th className="px-3 py-2 text-center">Devuelta tienda</th>
                </tr>
              </thead>
              <tbody>
                {lot.items.map((item) => {
                  const routeResult = (() => {
                    const root = asRecord(item.card?.metadata);
                    const route = asRecord(root.route);
                    return typeof route.result === "string" ? route.result : "";
                  })();
                  const isRecibida =
                    (item.recibida ?? "").toUpperCase() === "SI" || routeResult === "ACUSE_RECIBIDO";
                  const isRetornada =
                    (item.retornada ?? "").toUpperCase() === "SI" || routeResult === "DEVUELTA_TIENDA";
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-display text-xs font-semibold text-blue-700">{item.tc}</td>
                      <td className="px-3 py-2">{item.cedula ?? "-"}</td>
                      <td className="px-3 py-2">{item.telefono ?? "-"}</td>
                      <td className="px-3 py-2">{item.card?.customer.nombre ?? "-"}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isRecibida}
                          onChange={(event) =>
                            void onMark(item.id, event.target.checked ? "ACUSE_RECIBIDO" : "EN_RUTA")
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isRetornada}
                          onChange={(event) => {
                            if (!event.target.checked) {
                              void onMark(item.id, "EN_RUTA");
                              return;
                            }
                            const reason = onRequireReturnReason(item.card?.returnReason);
                            if (!reason) return;
                            void onMark(item.id, "DEVUELTA_TIENDA", reason);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
