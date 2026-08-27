"use client";

import { useEffect, useMemo, useState } from "react";
import { CardStatus } from "@prisma/client";
import {
  OperationalCardPicker,
  type OperationalCard,
} from "@/components/cards/operational-card-picker";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowStatusBar } from "@/components/ui/workflow-status-bar";
import { useWorkflowDraft } from "@/lib/use-workflow-draft";

type Motivo = { id: string; nombre: string; active: boolean };
type Provincia = { id: string; nombre: string; zona: string; active: boolean };

type CardRow = {
  id: string;
  tc: string;
  provincia: string;
  zona: string;
  isRemote: boolean;
  status: string;
  customer: { nombre: string; cedula: string };
};

type MassUpdateDraft = {
  scanInput: string;
  scannedCards: CardRow[];
  selectedCardIds: string[];
  batchStatus: string;
  batchProvincia: string;
  batchZona: string;
  batchRemote: string;
  batchReturnReason: string;
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
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [message, setMessage] = useState("");

  const draftPayload = useMemo<MassUpdateDraft>(
    () => ({
      scanInput,
      scannedCards,
      selectedCardIds,
      batchStatus,
      batchProvincia,
      batchZona,
      batchRemote,
      batchReturnReason,
    }),
    [
      batchProvincia,
      batchRemote,
      batchReturnReason,
      batchStatus,
      batchZona,
      scanInput,
      scannedCards,
      selectedCardIds,
    ],
  );
  const workflowDraft = useWorkflowDraft<MassUpdateDraft>({
    module: "modificacion-masiva",
    payload: draftPayload,
    shouldSave: scannedCards.length > 0,
    onRestore: (draft) => {
      setScanInput(draft.scanInput);
      setScannedCards(draft.scannedCards);
      setSelectedCardIds(draft.selectedCardIds);
      setBatchStatus(draft.batchStatus);
      setBatchProvincia(draft.batchProvincia);
      setBatchZona(draft.batchZona);
      setBatchRemote(draft.batchRemote);
      setBatchReturnReason(draft.batchReturnReason);
    },
  });

  function needsReturnReason(status: string) {
    return status === CardStatus.RETORNADA || status === CardStatus.DEVUELTA_TIENDA;
  }

  useEffect(() => {
    void (async () => {
      const [motivosRes, provinciasRes] = await Promise.all([
        fetch("/api/config/motivos-retorno", { cache: "no-store" }),
        fetch("/api/config/provincias", { cache: "no-store" }),
      ]);
      const [motivosJson, provinciasJson] = await Promise.all([
        motivosRes.json(),
        provinciasRes.json(),
      ]);
      setMotivos((motivosJson.motivos ?? []).filter((item: Motivo) => item.active));
      setProvincias(
        ((provinciasJson.provincias ?? []) as Provincia[]).filter((item) => item.active),
      );
    })();
  }, []);

  useEffect(() => {
    setSelectedCardIds((prev) => prev.filter((id) => scannedCards.some((card) => card.id === id)));
  }, [scannedCards]);

  const allSelected = scannedCards.length > 0 && selectedCardIds.length === scannedCards.length;

  function addSelectedCard(card: OperationalCard) {
    if (scannedCards.some((item) => item.id === card.id)) {
      setMessage("La tarjeta ya fue pistoleada");
      return;
    }

    const row: CardRow = {
      id: card.id,
      tc: card.tc,
      provincia: card.provincia ?? "",
      zona: card.zona ?? "",
      isRemote: Boolean(card.isRemote),
      status: card.status,
      customer: card.customer,
    };
    setScannedCards((prev) => [...prev, row]);
    setSelectedCardIds((prev) => [...prev, card.id]);
    setMessage("");
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
    await workflowDraft.clearDraft();
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
      <WorkflowStatusBar
        status={workflowDraft.status}
        updatedAt={workflowDraft.updatedAt}
        onUseRemote={workflowDraft.useRemoteVersion}
        onOverwrite={workflowDraft.overwriteRemote}
      />

      <Panel>
        <OperationalCardPicker
          value={scanInput}
          onValueChange={setScanInput}
          onCardSelected={addSelectedCard}
          onMessage={setMessage}
          placeholder="Pistolear TC/Cedula y presionar Enter"
          className="mb-3"
          autoFocus
        />

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
            onChange={(event) => {
              const nextProvince = event.target.value;
              setBatchProvincia(nextProvince);
              if (nextProvince === "UNCHANGED") {
                setBatchZona("UNCHANGED");
                return;
              }
              const province = provincias.find((item) => item.nombre === nextProvince);
              if (province) setBatchZona(province.zona);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="UNCHANGED">Provincia: sin cambio</option>
            {provincias.map((item) => (
              <option key={item.id} value={item.nombre}>
                Provincia: {item.nombre}
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
              void workflowDraft.clearDraft();
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
