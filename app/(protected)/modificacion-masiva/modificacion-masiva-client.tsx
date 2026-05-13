"use client";

import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { CardStatus } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

type Motivo = { id: string; nombre: string; active: boolean };

type CardRow = {
  id: string;
  tc: string;
  provincia: string;
  zona: string;
  isRemote: boolean;
  status: string;
  customer: { nombre: string; cedula: string };
};

const statuses: CardStatus[] = [
  CardStatus.DESPACHADA,
  CardStatus.ENVIADA_INTERIOR,
  CardStatus.EN_RUTA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.ENTREGADA,
  CardStatus.RETORNADA,
];
const zonas = ["Metro", "Este", "Norte", "Sur"];

export default function ModificacionMasivaClient() {
  const [scanInput, setScanInput] = useState("");
  const [scannedCards, setScannedCards] = useState<CardRow[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState<string>("UNCHANGED");
  const [batchProvincia, setBatchProvincia] = useState("UNCHANGED");
  const [batchZona, setBatchZona] = useState("UNCHANGED");
  const [batchRemote, setBatchRemote] = useState("UNCHANGED");
  const [batchReturnReason, setBatchReturnReason] = useState("");
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [message, setMessage] = useState("");

  function needsReturnReason(status: string) {
    return status === CardStatus.RETORNADA || status === CardStatus.DEVUELTA_TIENDA;
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/config/motivos-retorno", { cache: "no-store" });
      const json = await res.json();
      setMotivos((json.motivos ?? []).filter((item: Motivo) => item.active));
    })();
  }, []);

  useEffect(() => {
    setSelectedCardIds((prev) => prev.filter((id) => scannedCards.some((card) => card.id === id)));
  }, [scannedCards]);

  const provincias = useMemo(
    () => Array.from(new Set(scannedCards.map((card) => card.provincia))).sort(),
    [scannedCards],
  );
  const allSelected = scannedCards.length > 0 && selectedCardIds.length === scannedCards.length;

  async function findCard(identifier: string) {
    const res = await fetch(`/api/tarjetas?q=${encodeURIComponent(identifier)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const cards = (json.cards ?? []) as CardRow[];
    if (!cards.length) return null;

    const digits = identifier.replace(/\D/g, "");
    return (
      cards.find((card) => card.tc === identifier) ??
      cards.find(
        (card) =>
          card.customer.cedula === identifier || card.customer.cedula.replace(/\D/g, "") === digits,
      ) ??
      cards[0]
    );
  }

  async function addCardByScan() {
    const value = scanInput.trim();
    if (!value) return;

    const card = await findCard(value);
    if (!card) {
      setMessage("No se encontro tarjeta para ese TC/Cedula");
      setScanInput("");
      return;
    }

    if (scannedCards.some((item) => item.id === card.id)) {
      setMessage("La tarjeta ya fue pistoleada");
      setScanInput("");
      return;
    }

    setScannedCards((prev) => [...prev, card]);
    setSelectedCardIds((prev) => [...prev, card.id]);
    setScanInput("");
    setMessage("");
  }

  function onScanKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void addCardByScan();
    }
  }

  async function applyBatchChanges() {
    if (!scannedCards.length) {
      setMessage("Primero pistolea tarjetas");
      return;
    }
    if (!selectedCardIds.length) {
      setMessage("Selecciona al menos una tarjeta");
      return;
    }
    if (
      batchStatus === "UNCHANGED" &&
      batchProvincia === "UNCHANGED" &&
      batchZona === "UNCHANGED" &&
      batchRemote === "UNCHANGED"
    ) {
      setMessage("Selecciona estado, provincia, zona o remota para aplicar");
      return;
    }

    const selectedCards = scannedCards.filter((card) => selectedCardIds.includes(card.id));
    const payload: Record<string, unknown> = {
      cardIds: selectedCards.map((card) => card.id),
      note: "Cambio masivo por pistoleo",
    };
    const selectedStatus = batchStatus !== "UNCHANGED" ? batchStatus : null;
    if (selectedStatus && needsReturnReason(selectedStatus) && !batchReturnReason.trim()) {
      setMessage("Debes indicar motivo de devolucion para aplicar ese estado");
      return;
    }
    if (batchStatus !== "UNCHANGED") payload.status = batchStatus;
    if (batchProvincia !== "UNCHANGED") payload.provincia = batchProvincia;
    if (batchZona !== "UNCHANGED") payload.zona = batchZona;
    if (batchRemote !== "UNCHANGED") payload.isRemote = batchRemote === "YES";
    if (selectedStatus && needsReturnReason(selectedStatus)) {
      payload.returnReason = batchReturnReason.trim();
    }

    const res = await fetch("/api/tarjetas/lote/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({ error: "No se pudo aplicar cambios" }));

    if (!res.ok) {
      setMessage(json.error ?? "No se pudo aplicar cambios");
      return;
    }

    setMessage(`Cambios aplicados en ${selectedCards.length} tarjetas`);
    setScannedCards([]);
    setSelectedCardIds([]);
    setBatchStatus("UNCHANGED");
    setBatchProvincia("UNCHANGED");
    setBatchZona("UNCHANGED");
    setBatchRemote("UNCHANGED");
    setBatchReturnReason("");
  }

  function toggleSelectCard(cardId: string, checked: boolean) {
    setSelectedCardIds((prev) => {
      if (checked) {
        if (prev.includes(cardId)) return prev;
        return [...prev, cardId];
      }
      return prev.filter((id) => id !== cardId);
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedCardIds([]);
      return;
    }
    setSelectedCardIds(scannedCards.map((card) => card.id));
  }

  return (
    <div>
      <PageHeader
        title="Actualizacion masiva"
        subtitle="Pistolea tarjetas y aplica cambios de estado, provincia o zona en lote"
      />

      <Panel>
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-lg text-blue-700">⊙</span>
          <input
            value={scanInput}
            onChange={(event) => setScanInput(event.target.value)}
            onKeyDown={onScanKeyDown}
            placeholder="Pistolear TC/Cedula y presionar Enter"
            className="flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
          <button
            onClick={() => void addCardByScan()}
            className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700"
          >
            Agregar
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={batchStatus}
            onChange={(event) => {
              const nextStatus = event.target.value;
              setBatchStatus(nextStatus);
              if (nextStatus !== CardStatus.RETORNADA && nextStatus !== CardStatus.DEVUELTA_TIENDA) {
                setBatchReturnReason("");
              }
            }}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="UNCHANGED">Estado: sin cambio</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                Estado: {item}
              </option>
            ))}
          </select>
          <select
            value={batchProvincia}
            onChange={(event) => setBatchProvincia(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="UNCHANGED">Provincia: sin cambio</option>
            {provincias.map((item) => (
              <option key={item} value={item}>
                Provincia: {item}
              </option>
            ))}
          </select>
          <select
            value={batchZona}
            onChange={(event) => setBatchZona(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="UNCHANGED">Zona: sin cambio</option>
            {zonas.map((item) => (
              <option key={item} value={item}>
                Zona: {item}
              </option>
              ))}
          </select>
          <select
            value={batchRemote}
            onChange={(event) => setBatchRemote(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="UNCHANGED">Remota: sin cambio</option>
            <option value="YES">Remota: si</option>
            <option value="NO">Remota: no</option>
          </select>
          <select
            value={batchReturnReason}
            onChange={(event) => setBatchReturnReason(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
            disabled={!(batchStatus === CardStatus.RETORNADA || batchStatus === CardStatus.DEVUELTA_TIENDA)}
          >
            <option value="">Motivo de devolucion...</option>
            {motivos.map((item) => (
              <option key={item.id} value={item.nombre}>
                {item.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void applyBatchChanges()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Aplicar cambios ({selectedCardIds.length})
          </button>
          <button
            type="button"
            onClick={toggleSelectAll}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            {allSelected ? "Quitar seleccion total" : "Seleccionar todas"}
          </button>
          <button
            type="button"
            onClick={() => {
              setScannedCards([]);
              setSelectedCardIds([]);
            }}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            Limpiar
          </button>
        </div>

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel className="mt-5" title="Tarjetas pistoleadas">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">
                  <input type="checkbox" checked={allSelected} onChange={() => toggleSelectAll()} />
                </th>
                <th className="pb-2">TC</th>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Cedula</th>
                <th className="pb-2">Provincia</th>
                <th className="pb-2">Zona</th>
                <th className="pb-2">Remota</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {scannedCards.map((card) => (
                <tr key={card.id} className="border-t border-slate-100">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selectedCardIds.includes(card.id)}
                      onChange={(event) => toggleSelectCard(card.id, event.target.checked)}
                    />
                  </td>
                  <td className="py-2 font-medium text-blue-700">{card.tc}</td>
                  <td className="py-2">{card.customer.nombre}</td>
                  <td className="py-2">{card.customer.cedula}</td>
                  <td className="py-2">{card.provincia}</td>
                  <td className="py-2">{card.zona}</td>
                  <td className="py-2">{card.isRemote ? "SI" : "NO"}</td>
                  <td className="py-2">
                    <StatusBadge value={card.status} />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() =>
                        setScannedCards((prev) => prev.filter((item) => item.id !== card.id))
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {!scannedCards.length ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-slate-500">
                    No hay tarjetas pistoleadas.
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
