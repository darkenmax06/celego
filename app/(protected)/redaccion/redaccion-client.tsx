"use client";

import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

type CardLookup = {
  id: string;
  tc: string;
  provincia: string;
  zona: string;
  isRemote: boolean;
  status: string;
  dispatchDate: string | null;
  customer: { nombre: string; cedula: string };
};

type DraftRow = {
  cardId: string;
  tc: string;
  cedula: string;
  nombre: string;
  fecha: string;
  zona: string;
  isRemote: boolean;
  comentario: string;
};

type Redaction = {
  id: string;
  tipo: "ENTREGA" | "RETORNO";
  zona: string;
  status: string;
  fecha: string;
  items: Array<{
    id: string;
    comentario: string | null;
    appliedStatus: string;
      card: { tc: string; customer: { nombre: string; cedula: string } };
      isRemote?: boolean | null;
    }>;
  };

type Motivo = { id: string; nombre: string; active: boolean };
type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };

const ZONAS = ["Metro", "Este", "Norte", "Sur"];

function dateInputToDisplay(value: string) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function toDisplayDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-DO");
}

export default function RedaccionClient() {
  const [mode, setMode] = useState<"retorno" | "entrega">("retorno");
  const [scanInput, setScanInput] = useState("");
  const [zona, setZona] = useState("Este");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().slice(0, 10));
  const [retornos, setRetornos] = useState<DraftRow[]>([]);
  const [entregas, setEntregas] = useState<DraftRow[]>([]);
  const [selectedRetornos, setSelectedRetornos] = useState<string[]>([]);
  const [bulkMotivo, setBulkMotivo] = useState("");
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [redacciones, setRedacciones] = useState<Redaction[]>([]);
  const [historyPagination, setHistoryPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [historyPage, setHistoryPage] = useState(1);
  const [lastRedactionIds, setLastRedactionIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const listaActiva = mode === "retorno" ? retornos : entregas;
  const approvedRedactionIds = useMemo(
    () => redacciones.filter((row) => row.status === "APROBADA").map((row) => row.id),
    [redacciones],
  );
  const canExportApproved = true;

  async function loadCatalogs() {
    const params = new URLSearchParams({
      date: historyDate,
      zona,
      page: String(historyPage),
      pageSize: String(historyPagination.pageSize),
    });
    const [motivosRes, redRes] = await Promise.all([
      fetch("/api/config/motivos-retorno", { cache: "no-store" }),
      fetch(`/api/redacciones?${params.toString()}`, { cache: "no-store" }),
    ]);
    const [motivosJson, redJson] = await Promise.all([motivosRes.json(), redRes.json()]);
    setMotivos((motivosJson.motivos ?? []).filter((m: Motivo) => m.active));
    setRedacciones(redJson.redacciones ?? []);
    if (redJson.pagination) {
      setHistoryPagination(redJson.pagination as PaginationMeta);
      if (historyPage > redJson.pagination.totalPages) {
        setHistoryPage(redJson.pagination.totalPages);
      }
    }
  }

  useEffect(() => {
    void loadCatalogs();
  }, [historyDate, zona, historyPage]);

  const allScannedCardIds = useMemo(
    () => new Set([...retornos.map((item) => item.cardId), ...entregas.map((item) => item.cardId)]),
    [retornos, entregas],
  );

  async function findCard(identifier: string): Promise<CardLookup | null> {
    const res = await fetch(`/api/tarjetas?q=${encodeURIComponent(identifier)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cards = (data.cards ?? []) as CardLookup[];
    if (!cards.length) return null;

    const digits = identifier.replace(/\D/g, "");
    return (
      cards.find((card) => card.tc === identifier) ??
      cards.find((card) => card.customer.cedula === identifier || card.customer.cedula.replace(/\D/g, "") === digits) ??
      cards[0]
    );
  }

  async function addByScan() {
    const value = scanInput.trim();
    if (!value) return;

    const card = await findCard(value);
    if (!card) {
      setMessage("No se encontro tarjeta para ese TC/Cedula");
      setScanInput("");
      return;
    }

    if (allScannedCardIds.has(card.id)) {
      setMessage("Esa tarjeta ya fue pistoleada en esta redaccion");
      setScanInput("");
      return;
    }

    const row: DraftRow = {
      cardId: card.id,
      tc: card.tc,
      cedula: card.customer.cedula,
      nombre: card.customer.nombre,
      fecha: toDisplayDate(card.dispatchDate),
      zona: card.zona,
      isRemote: card.isRemote,
      comentario: "",
    };

    if (mode === "retorno") {
      setRetornos((prev) => [...prev, row]);
    } else {
      setEntregas((prev) => [...prev, row]);
    }

    setScanInput("");
    setMessage("");
  }

  function onScanKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void addByScan();
    }
  }

  function removeRow(cardId: string) {
    setRetornos((prev) => prev.filter((item) => item.cardId !== cardId));
    setEntregas((prev) => prev.filter((item) => item.cardId !== cardId));
    setSelectedRetornos((prev) => prev.filter((id) => id !== cardId));
  }

  function updateRetornoComment(cardId: string, comentario: string) {
    setRetornos((prev) =>
      prev.map((item) => (item.cardId === cardId ? { ...item, comentario } : item)),
    );
  }

  function updateRemote(cardId: string, isRemote: boolean) {
    setRetornos((prev) =>
      prev.map((item) => (item.cardId === cardId ? { ...item, isRemote } : item)),
    );
    setEntregas((prev) =>
      prev.map((item) => (item.cardId === cardId ? { ...item, isRemote } : item)),
    );
  }

  function applyBulkMotivo() {
    if (!bulkMotivo || !selectedRetornos.length) return;
    setRetornos((prev) =>
      prev.map((item) =>
        selectedRetornos.includes(item.cardId) ? { ...item, comentario: bulkMotivo } : item,
      ),
    );
    setSelectedRetornos([]);
    setBulkMotivo("");
  }

  async function approveRedaction() {
    if (!retornos.length && !entregas.length) {
      setMessage("No hay tarjetas pistoleadas para aprobar");
      return;
    }
    const missingReason = retornos.find((item) => !item.comentario.trim());
    if (missingReason) {
      setMessage(`Debes indicar motivo de devolucion para la tarjeta ${missingReason.tc}`);
      return;
    }

    setProcessing(true);
    setMessage("");

    const generateRes = await fetch("/api/redacciones/generar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zona,
        fecha,
        entregadas: entregas.map((item) => ({
          cardId: item.cardId,
          isRemote: item.isRemote,
          comentario: item.comentario || undefined,
        })),
        retornadas: retornos.map((item) => ({
          cardId: item.cardId,
          isRemote: item.isRemote,
          comentario: item.comentario || undefined,
        })),
      }),
    });

    const generateData = await generateRes.json();
    if (!generateRes.ok) {
      setMessage(generateData.error ?? "No se pudo generar redaccion");
      setProcessing(false);
      return;
    }

    const redactionIds = (generateData.redactions ?? []).map((red: Redaction) => red.id);
    const approveRes = await fetch("/api/redacciones/aprobar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redactionIds }),
    });

    const approveData = await approveRes.json();
    if (!approveRes.ok) {
      setMessage(approveData.error ?? "No se pudo aprobar redaccion");
      setProcessing(false);
      return;
    }

    setLastRedactionIds(redactionIds);
    setRetornos([]);
    setEntregas([]);
    setSelectedRetornos([]);
    setHistoryDate(fecha);
    setHistoryPage(1);
    setMessage(`Redaccion aprobada: ${approveData.updatedItems} tarjetas actualizadas`);
    setProcessing(false);
    await loadCatalogs();
  }

  async function exportRelation(format: "xlsx" | "csv" | "pdf") {
    const approvedSet = new Set(approvedRedactionIds);
    const preferred = lastRedactionIds.filter((id) => approvedSet.has(id));
    const exportIds = preferred.length ? preferred : approvedRedactionIds;

    const params = new URLSearchParams({
      type: "redaccion",
      format,
      zona,
      date: historyDate,
    });
    if (exportIds.length) {
      params.set("redactionIds", exportIds.join(","));
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
    a.href = url;
    a.download = `entregas-retornos-${fecha}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Relacion exportada en ${format.toUpperCase()}`);
  }

  return (
    <div>
      <PageHeader
        title="Redaccion"
        subtitle="Pistoleo y aprobacion de entregas/retornos con actualizacion de estados"
      />

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={zona}
              onChange={(e) => {
                setZona(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              {ZONAS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void approveRedaction()}
              disabled={processing}
              className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {processing ? "Procesando..." : "Aprobar redaccion"}
            </button>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setMode("retorno")}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
              mode === "retorno"
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            Tarjetas Retornadas ({retornos.length})
          </button>
          <button
            onClick={() => setMode("entrega")}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
              mode === "entrega"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            Acuses de Entrega ({entregas.length})
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-lg text-blue-700">⊙</span>
          <input
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={onScanKeyDown}
            placeholder="Pistolear codigo o digitar No. TC / Cedula y presionar Enter"
            className="flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
          <button
            onClick={() => void addByScan()}
            className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700"
          >
            Agregar
          </button>
        </div>

        {mode === "retorno" && selectedRetornos.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <span className="text-sm font-semibold text-rose-700">
              {selectedRetornos.length} seleccionadas
            </span>
            <select
              value={bulkMotivo}
              onChange={(e) => setBulkMotivo(e.target.value)}
              className="min-w-52 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">Seleccionar motivo...</option>
              {motivos.map((motivo) => (
                <option key={motivo.id} value={motivo.nombre}>
                  {motivo.nombre}
                </option>
              ))}
            </select>
            <button
              onClick={applyBulkMotivo}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Aplicar a seleccionadas
            </button>
            <button
              onClick={() => setSelectedRetornos([])}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              Cancelar
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{mode === "retorno" ? "" : "#"}</th>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Numero TC</th>
                <th className="px-3 py-2">Cedula</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Remota</th>
                {mode === "retorno" ? <th className="px-3 py-2">Comentario</th> : null}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {listaActiva.map((row, index) => (
                <tr key={row.cardId} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {mode === "retorno" ? (
                      <input
                        type="checkbox"
                        checked={selectedRetornos.includes(row.cardId)}
                        onChange={(e) => {
                          setSelectedRetornos((prev) =>
                            e.target.checked
                              ? [...prev, row.cardId]
                              : prev.filter((id) => id !== row.cardId),
                          );
                        }}
                      />
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                  <td className="px-3 py-2 font-medium text-blue-700">{row.tc}</td>
                  <td className="px-3 py-2">{row.cedula}</td>
                  <td className="px-3 py-2">{row.nombre}</td>
                  <td className="px-3 py-2">{row.fecha}</td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.isRemote}
                      onChange={(e) => updateRemote(row.cardId, e.target.checked)}
                    />
                  </td>
                  {mode === "retorno" ? (
                    <td className="px-3 py-2">
                      <input
                        value={row.comentario}
                        onChange={(e) => updateRetornoComment(row.cardId, e.target.value)}
                        list="motivos-retorno-list"
                        placeholder="Motivo..."
                        className="w-full rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeRow(row.cardId)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {!listaActiva.length ? (
                <tr>
                  <td
                    colSpan={mode === "retorno" ? 9 : 8}
                    className="px-3 py-8 text-center text-sm text-slate-500"
                  >
                    No hay tarjetas. Pistolea TC/Cedula para agregarlas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <datalist id="motivos-retorno-list">
          {motivos.map((motivo) => (
            <option key={motivo.id} value={motivo.nombre} />
          ))}
        </datalist>

        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel className="mt-5" title="Historial del dia/zona">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Fecha historial
              <input
                type="date"
                value={historyDate}
                onChange={(event) => {
                  setHistoryDate(event.target.value);
                  setHistoryPage(1);
                }}
                className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setHistoryPage(1);
                void loadCatalogs();
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              Actualizar historial
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void exportRelation("xlsx")}
            disabled={!canExportApproved}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Exportar Excel
          </button>
          <button
            onClick={() => void exportRelation("csv")}
            disabled={!canExportApproved}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Exportar CSV
          </button>
          <button
            onClick={() => void exportRelation("pdf")}
            disabled={!canExportApproved}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Exportar PDF
          </button>
          <p className="text-xs text-slate-500">
            Exportacion disponible solo para redacciones aprobadas.
          </p>
          </div>
        </div>

        <div className="space-y-3">
          {redacciones.map((red) => (
            <article key={red.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {red.tipo} - {red.zona} - {dateInputToDisplay(historyDate)}
                </p>
                <StatusBadge value={red.status} />
              </div>
              <p className="text-xs text-slate-500">{new Date(red.fecha).toLocaleString("es-DO")}</p>
              <p className="mt-2 text-xs text-slate-600">Tarjetas: {red.items.length}</p>
            </article>
          ))}
          {!redacciones.length ? (
            <p className="text-sm text-slate-500">No hay redacciones para la fecha/zona seleccionadas.</p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span>
            Pagina {historyPagination.page} de {historyPagination.totalPages} · {historyPagination.total} registros
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
              disabled={historyPage <= 1}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() =>
                setHistoryPage((prev) => Math.min(historyPagination.totalPages, prev + 1))
              }
              disabled={historyPage >= historyPagination.totalPages}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
