"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardStatus } from "@prisma/client";
import { PencilLine } from "lucide-react";
import { CardExportWizardModal } from "@/components/cards/card-export-wizard-modal";
import { CardSelectionBar, type SelectedCardEntry } from "@/components/cards/card-selection-bar";
import {
  OperationalCardPicker,
  type OperationalCard,
} from "@/components/cards/operational-card-picker";
import {
  BulkEditWizardModal,
  buildBulkEditPayload,
  type BulkEditMessenger,
  type BulkEditValues,
} from "@/components/modificacion-masiva/bulk-edit-wizard-modal";
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
  currentMessenger?: { id: string; nombre: string } | null;
};

/**
 * Autosaved scanning session. Field choices now live in the edit wizard and
 * are not persisted; older drafts may still carry the legacy `batch*` keys,
 * which are simply ignored on restore.
 */
type MassUpdateDraft = {
  scanInput: string;
  scannedCards: CardRow[];
  selectedCardIds: string[];
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
  CardStatus.TD_ENTREGADO,
  CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  CardStatus.TD_NO_LE_INTERESA,
  CardStatus.TD_RETIRADA_EN_OFICINA,
  CardStatus.TD_SOLICITADA_POR_ERROR,
  CardStatus.TD_ZONA_FUERA_COBERTURA,
  CardStatus.NO_LOCALIZADO,
];
const zonas = ["Metro", "Este", "Norte", "Sur"];

export default function ModificacionMasivaClient() {
  const [scanInput, setScanInput] = useState("");
  const [scannedCards, setScannedCards] = useState<CardRow[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [messengers, setMessengers] = useState<BulkEditMessenger[]>([]);
  const [message, setMessage] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const focusScanInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      scanInputRef.current?.focus();
    });
  }, []);

  const draftPayload = useMemo<MassUpdateDraft>(
    () => ({ scanInput, scannedCards, selectedCardIds }),
    [scanInput, scannedCards, selectedCardIds],
  );
  const workflowDraft = useWorkflowDraft<MassUpdateDraft>({
    module: "modificacion-masiva",
    payload: draftPayload,
    shouldSave: scannedCards.length > 0,
    onRestore: (draft) => {
      setScanInput(draft.scanInput ?? "");
      setScannedCards(draft.scannedCards ?? []);
      setSelectedCardIds(draft.selectedCardIds ?? []);
      // Drafts saved before the messenger column existed lack it; refresh it.
      for (const card of draft.scannedCards ?? []) void loadCurrentMessenger(card.id);
    },
  });

  useEffect(() => {
    void (async () => {
      const [motivosRes, provinciasRes, messengersRes] = await Promise.all([
        fetch("/api/config/motivos-retorno", { cache: "no-store" }),
        fetch("/api/config/provincias", { cache: "no-store" }),
        fetch("/api/mensajeros?onlyActive=1", { cache: "no-store" }),
      ]);
      const [motivosJson, provinciasJson, messengersJson] = await Promise.all([
        motivosRes.json().catch(() => ({})),
        provinciasRes.json().catch(() => ({})),
        messengersRes.json().catch(() => ({})),
      ]);
      setMotivos((motivosJson.motivos ?? []).filter((item: Motivo) => item.active));
      setProvincias(
        ((provinciasJson.provincias ?? []) as Provincia[]).filter((item) => item.active),
      );
      setMessengers(
        ((messengersJson.messengers ?? []) as BulkEditMessenger[]).map((item) => ({
          id: item.id,
          nombre: item.nombre,
          provinciaTrabajo: item.provinciaTrabajo ?? null,
        })),
      );
    })();
  }, []);

  useEffect(() => {
    setSelectedCardIds((prev) => prev.filter((id) => scannedCards.some((card) => card.id === id)));
  }, [scannedCards]);

  const allSelected = scannedCards.length > 0 && selectedCardIds.length === scannedCards.length;
  const selectedCards = useMemo(
    () => scannedCards.filter((card) => selectedCardIds.includes(card.id)),
    [scannedCards, selectedCardIds],
  );
  const cardsById = useMemo(() => {
    const map: Record<string, SelectedCardEntry> = {};
    for (const card of scannedCards) {
      map[card.id] = { id: card.id, tc: card.tc, customerName: card.customer.nombre, cedula: card.customer.cedula };
    }
    return map;
  }, [scannedCards]);

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
      currentMessenger: null,
    };
    setScannedCards((prev) => [...prev, row]);
    setSelectedCardIds((prev) => [...prev, card.id]);
    setMessage("");
    void loadCurrentMessenger(card.id);
  }

  /** The scanner lookup carries no messenger, so it is filled from the card detail. */
  async function loadCurrentMessenger(cardId: string) {
    try {
      const res = await fetch(`/api/tarjetas/${cardId}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { card?: { currentMessenger?: { id: string; nombre: string } | null } };
      const messenger = json.card?.currentMessenger;
      setScannedCards((prev) =>
        prev.map((item) =>
          item.id === cardId
            ? { ...item, currentMessenger: messenger ? { id: messenger.id, nombre: messenger.nombre } : null }
            : item,
        ),
      );
    } catch {
      // Messenger stays unknown; the column shows "-".
    }
  }

  const closeEditWizard = useCallback(() => {
    setEditOpen(false);
    focusScanInput();
  }, [focusScanInput]);

  const closeExportWizard = useCallback(() => {
    setExportOpen(false);
    focusScanInput();
  }, [focusScanInput]);

  async function applyBulkEdit(values: BulkEditValues, affectedCardIds: string[]): Promise<string | null> {
    if (!affectedCardIds.length) return "Ninguna tarjeta cambia con estos valores";

    const res = await fetch("/api/tarjetas/lote/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBulkEditPayload(affectedCardIds, values)),
    });
    const json = await res.json().catch(() => ({ error: "No se pudo aplicar cambios" }));
    if (!res.ok) return json.error ?? "No se pudo aplicar cambios";

    // Applied cards leave the session; unselected or unchanged ones stay scanned.
    const applied = new Set(affectedCardIds);
    const remaining = scannedCards.filter((card) => !applied.has(card.id));
    setScannedCards(remaining);
    setSelectedCardIds((prev) => prev.filter((id) => !applied.has(id)));
    setMessage(`Cambios aplicados en ${affectedCardIds.length} tarjetas`);
    if (!remaining.length) await workflowDraft.clearDraft();
    closeEditWizard();
    return null;
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
        subtitle="Pistolea tarjetas, selecciónalas y edítalas en lote con revisión previa"
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
          autoFocus
          inputRef={scanInputRef}
        />
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel className="mt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Tarjetas pistoleadas ({scannedCards.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              disabled={!selectedCardIds.length}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PencilLine className="h-4 w-4" />
              Editar seleccionadas ({selectedCardIds.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setScannedCards([]);
                setSelectedCardIds([]);
                setMessage("");
                void workflowDraft.clearDraft();
                focusScanInput();
              }}
              disabled={!scannedCards.length}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las tarjetas pistoleadas"
                    checked={allSelected}
                    onChange={() => toggleSelectAll()}
                  />
                </th>
                <th className="pb-2">TC</th>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Cedula</th>
                <th className="pb-2">Provincia</th>
                <th className="pb-2">Zona</th>
                <th className="pb-2">Remota</th>
                <th className="pb-2">Mensajero</th>
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
                      aria-label={`Seleccionar tarjeta ${card.tc}`}
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
                  <td className="py-2">{card.currentMessenger?.nombre ?? "-"}</td>
                  <td className="py-2">
                    <StatusBadge value={card.status} />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
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
                  <td colSpan={10} className="py-6 text-center text-sm text-slate-500">
                    No hay tarjetas pistoleadas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <CardSelectionBar
        count={selectedCardIds.length}
        selectedIds={selectedCardIds}
        cardsById={cardsById}
        onClear={() => setSelectedCardIds([])}
        onDeselect={(cardId) => toggleSelectCard(cardId, false)}
        onExport={() => setExportOpen(true)}
      />

      {editOpen && selectedCards.length ? (
        <BulkEditWizardModal
          cards={selectedCards}
          statuses={statuses}
          zonas={zonas}
          provinces={provincias.map((item) => ({ nombre: item.nombre, zona: item.zona }))}
          returnReasons={motivos.map((item) => ({ value: item.nombre, label: item.nombre }))}
          messengers={messengers}
          onClose={closeEditWizard}
          onApply={applyBulkEdit}
        />
      ) : null}

      {exportOpen && selectedCardIds.length ? (
        <CardExportWizardModal cardIds={selectedCardIds} onClose={closeExportWizard} onExported={setMessage} />
      ) : null}
    </div>
  );
}
