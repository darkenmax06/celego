"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OperationalCardPicker,
  type OperationalCard,
} from "@/components/cards/operational-card-picker";
import {
  RedaccionDraftsModal,
  type SavedRedactionDraftSummary,
} from "@/components/redaccion/redaccion-drafts-modal";
import {
  RedaccionErrorWizardModal,
  type RedactionWizardErrorState,
} from "@/components/redaccion/redaccion-error-wizard-modal";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowStatusBar } from "@/components/ui/workflow-status-bar";
import {
  admitCardIntoRedaction,
  dispatchOriginLabel,
  type DispatchOrigin,
} from "@/lib/dispatch-origin";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useWorkflowDraft } from "@/lib/use-workflow-draft";

type DraftRow = {
  cardId: string;
  tc: string;
  cedula: string;
  nombre: string;
  fecha: string;
  zona: string;
  isRemote: boolean;
  comentario: string;
  dispatchOrigin: DispatchOrigin | null;
};

type Redaction = {
  id: string;
  tipo: "ENTREGA" | "RETORNO";
  zona: string;
  status: string;
  fecha: string;
  notas?: string | null;
  dispatchOrigin?: DispatchOrigin | null;
  items: Array<{
    id: string;
    cardId: string;
    comentario: string | null;
    appliedStatus: string;
    card: { tc: string; customer: { nombre: string; cedula: string } };
    isRemote?: boolean | null;
  }>;
};

type Motivo = { id: string; nombre: string; active: boolean };
type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type RedactionDraft = {
  mode: "retorno" | "entrega";
  scanInput: string;
  zona: string;
  fecha: string;
  historyDate: string;
  retornos: DraftRow[];
  entregas: DraftRow[];
  selectedRetornos: string[];
  bulkMotivo: string;
  historyPage: number;
};

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
  const [mode, setMode] = usePersistentState<"retorno" | "entrega">(
    "redaccion:mode",
    "retorno",
  );
  const [scanInput, setScanInput] = useState("");
  const [zona, setZona] = usePersistentState("redaccion:zona", "Este");
  const [fecha, setFecha] = usePersistentState(
    "redaccion:fecha",
    new Date().toISOString().slice(0, 10),
  );
  const [historyDate, setHistoryDate] = usePersistentState(
    "redaccion:history-date",
    new Date().toISOString().slice(0, 10),
  );
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
  const [historyPage, setHistoryPage] = usePersistentState("redaccion:history-page", 1);
  const [editingRedactionId, setEditingRedactionId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [errorWizard, setErrorWizard] = useState<RedactionWizardErrorState | null>(null);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [activeDraftKey, setActiveDraftKey] = usePersistentState(
    "redaccion:active-draft-key",
    "default",
  );
  const [savedDrafts, setSavedDrafts] = useState<SavedRedactionDraftSummary[]>([]);
  const [showDraftsModal, setShowDraftsModal] = useState(false);

  const draftPayload = useMemo<RedactionDraft>(
    () => ({
      mode,
      scanInput,
      zona,
      fecha,
      historyDate,
      retornos,
      entregas,
      selectedRetornos,
      bulkMotivo,
      historyPage,
    }),
    [
      bulkMotivo,
      entregas,
      fecha,
      historyDate,
      historyPage,
      mode,
      retornos,
      scanInput,
      selectedRetornos,
      zona,
    ],
  );
  const workflowDraft = useWorkflowDraft<RedactionDraft>({
    module: "redaccion",
    contextKey: activeDraftKey,
    payload: draftPayload,
    shouldSave: retornos.length > 0 || entregas.length > 0,
    onRestore: (draft) => {
      setMode(draft.mode);
      setScanInput(draft.scanInput);
      setZona(draft.zona);
      setFecha(draft.fecha);
      setHistoryDate(draft.historyDate);
      setRetornos(draft.retornos);
      setEntregas(draft.entregas);
      setSelectedRetornos(draft.selectedRetornos);
      setBulkMotivo(draft.bulkMotivo);
      setHistoryPage(draft.historyPage);
    },
  });
  const workflowDraftStatus = workflowDraft.status;
  const clearWorkflowDraft = workflowDraft.clearDraft;

  async function loadSavedDrafts() {
    try {
      const res = await fetch("/api/workflow-drafts?module=redaccion&all=true", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({ drafts: [] }));
      if (res.ok && Array.isArray(json.drafts)) {
        setSavedDrafts(json.drafts as SavedRedactionDraftSummary[]);
      }
    } catch {}
  }

  useEffect(() => {
    void loadSavedDrafts();
  }, [workflowDraft.status, activeDraftKey]);

  const listaActiva = mode === "retorno" ? retornos : entregas;
  const allRetornosSelected = retornos.length > 0 && selectedRetornos.length === retornos.length;
  const approvedRedactionIds = useMemo(
    () => redacciones.filter((row) => row.status === "APROBADA").map((row) => row.id),
    [redacciones],
  );
  const canExportApproved = approvedRedactionIds.length > 0;
  const editingRedaction = useMemo(
    () => redacciones.find((row) => row.id === editingRedactionId) ?? null,
    [editingRedactionId, redacciones],
  );

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

  async function persistDraftImmediately(key: string, payload: RedactionDraft) {
    if (payload.retornos.length === 0 && payload.entregas.length === 0) return;
    try {
      await fetch("/api/workflow-drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "redaccion",
          contextKey: key,
          payload,
        }),
      });
    } catch {}
  }

  const allScannedCardIds = useMemo(
    () => new Set([...retornos.map((item) => item.cardId), ...entregas.map((item) => item.cardId)]),
    [retornos, entregas],
  );

  // A redaction belongs to a single dispatch origin. The first scanned card fixes
  // it for the whole draft; the API rejects mixed origins with a 409 anyway, so
  // catching it here keeps the operator from building a draft that cannot ship.
  const draftOrigin = useMemo<DispatchOrigin | null>(
    () =>
      [...retornos, ...entregas].find((item) => item.dispatchOrigin)?.dispatchOrigin ?? null,
    [retornos, entregas],
  );

  function addSelectedCard(card: OperationalCard) {
    if (allScannedCardIds.has(card.id)) {
      setErrorWizard({
        type: "DUPLICATE",
        title: "Tarjeta ya pistoleada",
        subtitle: `TC: ${card.tc} · ${card.customer.nombre}`,
        message: `La tarjeta ${card.tc} ya fue agregada previamente a la lista de esta redacción.`,
        scannedCard: card,
        suggestedAction:
          "Revisa la tabla de tarjetas cargadas. No es necesario pistolear la misma tarjeta más de una vez en esta redacción.",
      });
      return;
    }

    const admission = admitCardIntoRedaction({
      draftOrigin,
      cardOrigin: card.dispatchOrigin,
      cardLabel: card.tc,
    });
    if (!admission.ok) {
      setErrorWizard({
        type: admission.code === "MIXED_DISPATCH_ORIGIN" ? "MIXED_ORIGIN" : "MISSING_ORIGIN",
        title:
          admission.code === "MIXED_DISPATCH_ORIGIN"
            ? "Incompatibilidad de Procedencia"
            : "Procedencia No Registrada",
        subtitle: `TC: ${card.tc} · ${card.customer.nombre}`,
        message: admission.message,
        scannedCard: card,
        draftOrigin,
        cardOrigin: card.dispatchOrigin,
        zona,
        totalDraftCards: retornos.length + entregas.length,
        suggestedAction:
          admission.code === "MIXED_DISPATCH_ORIGIN"
            ? `Esta redacción contiene tarjetas de ${dispatchOriginLabel(draftOrigin)}. Aparta físicamente la tarjeta ${card.tc} para pistolearla en una redacción separada de ${dispatchOriginLabel(card.dispatchOrigin)}.`
            : `La tarjeta ${card.tc} no tiene procedencia asignada en el sistema. Debes asignarle procedencia antes de procesarla en una relación.`,
      });
      return;
    }

    const row: DraftRow = {
      cardId: card.id,
      tc: card.tc,
      cedula: card.customer.cedula,
      nombre: card.customer.nombre,
      fecha: toDisplayDate(card.dispatchDate),
      zona: card.zona ?? "",
      isRemote: Boolean(card.isRemote),
      comentario: "",
      dispatchOrigin: card.dispatchOrigin,
    };

    if (mode === "retorno") {
      setRetornos((prev) => [...prev, row]);
    } else {
      setEntregas((prev) => [...prev, row]);
    }

    setMessage("");
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

  function toggleSelectAllRetornos() {
    if (allRetornosSelected) {
      setSelectedRetornos([]);
      return;
    }
    setSelectedRetornos(retornos.map((item) => item.cardId));
  }

  function handleStartApprove() {
    if (!retornos.length && !entregas.length) {
      setErrorWizard({
        type: "APPROVAL_VALIDATION",
        title: "Sin tarjetas para aprobar",
        message: "No hay tarjetas retornadas ni acuses de entrega pistoleados en esta redacción.",
        suggestedAction: "Pistolea al menos una tarjeta antes de aprobar la redacción.",
      });
      return;
    }

    const missingReasons = retornos.filter((item) => !item.comentario.trim());
    if (missingReasons.length > 0) {
      setErrorWizard({
        type: "APPROVAL_VALIDATION",
        title: "Motivos de Devolución Requeridos",
        subtitle: `${missingReasons.length} tarjeta(s) sin motivo`,
        message: "Debes especificar el motivo de devolución para todas las tarjetas retornadas antes de aprobar la redacción.",
        missingCards: missingReasons.map((item) => ({ tc: item.tc, nombre: item.nombre })),
        suggestedAction:
          "Completa los motivos de devolución en la tabla (puedes seleccionarlas con el checkbox y usar la barra de asignación masiva de motivos) y vuelve a intentar la aprobación.",
      });
      return;
    }

    setShowApproveConfirm(true);
  }

  async function confirmApproveRedaction() {
    setShowApproveConfirm(false);
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
      setErrorWizard({
        type: "GENERIC",
        title: "Error al generar redacción",
        message: generateData.error ?? "No se pudo generar la redacción.",
        suggestedAction: "Verifica los datos e inténtalo de nuevo o contacta al administrador.",
      });
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
      setErrorWizard({
        type: "GENERIC",
        title: "Error al aprobar redacción",
        message: approveData.error ?? "No se pudo aprobar la redacción.",
        suggestedAction: "Revisa los registros en el sistema e inténtalo nuevamente.",
      });
      setProcessing(false);
      return;
    }

    setRetornos([]);
    setEntregas([]);
    setSelectedRetornos([]);
    setHistoryDate(fecha);
    setHistoryPage(1);
    setMessage(`Redacción aprobada exitosamente: ${approveData.updatedItems} tarjeta(s) actualizadas`);
    setProcessing(false);
    await fetch("/api/workflow-drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "redaccion", contextKey: activeDraftKey }),
    });
    setActiveDraftKey(`draft_${Date.now()}`);
    await loadSavedDrafts();
    await loadCatalogs();
  }

  async function handleCreateNewDraft() {
    if (retornos.length > 0 || entregas.length > 0) {
      await persistDraftImmediately(activeDraftKey, draftPayload);
    }
    const newKey = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setRetornos([]);
    setEntregas([]);
    setSelectedRetornos([]);
    setBulkMotivo("");
    setScanInput("");
    setActiveDraftKey(newKey);
    setShowDraftsModal(false);
    await loadSavedDrafts();
    setMessage("Nueva redacción en blanco iniciada");
  }

  async function handleSelectDraft(targetKey: string) {
    if (targetKey === activeDraftKey) {
      setShowDraftsModal(false);
      return;
    }
    if (retornos.length > 0 || entregas.length > 0) {
      await persistDraftImmediately(activeDraftKey, draftPayload);
    }

    const cached = savedDrafts.find((d) => d.contextKey === targetKey);
    if (cached?.payload) {
      const p = cached.payload as unknown as RedactionDraft;
      setMode(p.mode ?? "retorno");
      setScanInput(p.scanInput ?? "");
      setZona(p.zona ?? "Este");
      setFecha(p.fecha ?? new Date().toISOString().slice(0, 10));
      setHistoryDate(p.historyDate ?? new Date().toISOString().slice(0, 10));
      setRetornos((p.retornos as DraftRow[]) ?? []);
      setEntregas((p.entregas as DraftRow[]) ?? []);
      setSelectedRetornos(p.selectedRetornos ?? []);
      setBulkMotivo(p.bulkMotivo ?? "");
      setHistoryPage(p.historyPage ?? 1);
    } else {
      try {
        const res = await fetch(
          `/api/workflow-drafts?module=redaccion&contextKey=${encodeURIComponent(targetKey)}`,
          { cache: "no-store" },
        );
        const json = await res.json().catch(() => ({ draft: null }));
        if (json.draft?.payload) {
          const p = json.draft.payload as RedactionDraft;
          setMode(p.mode ?? "retorno");
          setScanInput(p.scanInput ?? "");
          setZona(p.zona ?? "Este");
          setFecha(p.fecha ?? new Date().toISOString().slice(0, 10));
          setHistoryDate(p.historyDate ?? new Date().toISOString().slice(0, 10));
          setRetornos(p.retornos ?? []);
          setEntregas(p.entregas ?? []);
          setSelectedRetornos(p.selectedRetornos ?? []);
          setBulkMotivo(p.bulkMotivo ?? "");
          setHistoryPage(p.historyPage ?? 1);
        }
      } catch {}
    }

    setActiveDraftKey(targetKey);
    setShowDraftsModal(false);
    await loadSavedDrafts();
    setMessage("Borrador seleccionado cargado en pantalla");
  }

  async function handleDeleteDraft(targetKey: string) {
    await fetch("/api/workflow-drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "redaccion", contextKey: targetKey }),
    });
    if (targetKey === activeDraftKey) {
      setRetornos([]);
      setEntregas([]);
      setSelectedRetornos([]);
      setActiveDraftKey(`draft_${Date.now()}`);
    }
    await loadSavedDrafts();
    setMessage("Borrador descartado");
  }

  async function handleSaveAndSwitchToCardOrigin(
    newOrigin: DispatchOrigin,
    card?: OperationalCard | null,
  ) {
    if (retornos.length > 0 || entregas.length > 0) {
      await persistDraftImmediately(activeDraftKey, draftPayload);
    }

    const newKey = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newRow: DraftRow | null = card
      ? {
          cardId: card.id,
          tc: card.tc,
          cedula: card.customer.cedula,
          nombre: card.customer.nombre,
          fecha: toDisplayDate(card.dispatchDate),
          zona: card.zona ?? zona,
          isRemote: Boolean(card.isRemote),
          comentario: "",
          dispatchOrigin: card.dispatchOrigin,
        }
      : null;

    const nextRetornos = mode === "retorno" && newRow ? [newRow] : [];
    const nextEntregas = mode === "entrega" && newRow ? [newRow] : [];

    setRetornos(nextRetornos);
    setEntregas(nextEntregas);
    setSelectedRetornos([]);
    setBulkMotivo("");
    setScanInput("");

    const nextPayload: RedactionDraft = {
      mode,
      scanInput: "",
      zona: card?.zona ?? zona,
      fecha,
      historyDate,
      retornos: nextRetornos,
      entregas: nextEntregas,
      selectedRetornos: [],
      bulkMotivo: "",
      historyPage: 1,
    };
    await persistDraftImmediately(newKey, nextPayload);

    setActiveDraftKey(newKey);
    setErrorWizard(null);
    await loadSavedDrafts();
    setMessage(
      `Borrador anterior guardado. Redacción para ${dispatchOriginLabel(newOrigin)} iniciada${
        newRow ? ` con tarjeta TC ${newRow.tc}` : ""
      }.`,
    );
  }

  async function exportRelation(format: "xlsx" | "pdf", redactionId?: string) {
    if (!redactionId && !approvedRedactionIds.length) {
      setMessage("No hay relaciones aprobadas para exportar");
      return;
    }

    const params = new URLSearchParams({
      type: "redaccion",
      format,
      zona,
      date: historyDate,
    });
    if (redactionId) {
      params.set("redactionIds", redactionId);
      const targetRed = redacciones.find((r) => r.id === redactionId);
      if (targetRed) {
        if (targetRed.tipo) params.set("redactionType", targetRed.tipo);
        if (targetRed.dispatchOrigin) params.set("origin", targetRed.dispatchOrigin);
      }
    } else if (approvedRedactionIds.length) {
      params.set("redactionIds", approvedRedactionIds.join(","));
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
    a.download = redactionId
      ? `relacion-${redactionId.slice(-6)}.${format}`
      : `entregas-retornos-${historyDate}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(
      redactionId
        ? `Relacion ${redactionId.slice(-6)} exportada en ${format.toUpperCase()}`
        : `Relaciones exportadas en ${format.toUpperCase()}`,
    );
  }

  async function addItemsToRedaction(
    redactionId: string,
    items: Array<{ cardId: string; isRemote?: boolean; comentario?: string }>,
  ) {
    const res = await fetch("/api/redacciones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ADD_ITEMS",
        redactionId,
        items,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo actualizar la relacion");
      return false;
    }

    setMessage(
      data.appliedImmediately
        ? `Relacion actualizada. ${data.addedItems} tarjeta(s) agregadas y aplicadas`
        : `Relacion actualizada. ${data.addedItems} tarjeta(s) agregadas`,
    );
    setHistoryPage(1);
    await loadCatalogs();
    return true;
  }

  return (
    <div>
      <PageHeader
        title="Redaccion"
        subtitle="Pistoleo y aprobacion de entregas/retornos con actualizacion de estados"
      />
      <WorkflowStatusBar
        status={workflowDraft.status}
        updatedAt={workflowDraft.updatedAt}
        onUseRemote={workflowDraft.useRemoteVersion}
        onOverwrite={workflowDraft.overwriteRemote}
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

            {draftOrigin ? (
              <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/90 px-3 py-2 text-xs text-blue-950 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-slate-600">Procedencia activa:</span>
                <span className="font-bold text-blue-900">
                  {draftOrigin === "TORRE_POPULAR" ? "🏛️ Torre Popular" : "📦 Centro de acopio"}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 font-medium">
                  {retornos.length + entregas.length} tarjeta(s)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span>Procedencia: <em className="text-slate-600">Se fijará al pistolear la primera tarjeta</em></span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDraftsModal(true)}
              className="relative inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <span>📂 Borradores</span>
              {savedDrafts.length > 0 ? (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                  {savedDrafts.length}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={handleCreateNewDraft}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              + Nueva redacción
            </button>

            <button
              onClick={handleStartApprove}
              disabled={processing || (!retornos.length && !entregas.length)}
              className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#1a3860] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? "Procesando..." : "Aprobar redacción"}
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

        {mode === "retorno" && retornos.length > 0 ? (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={toggleSelectAllRetornos}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {allRetornosSelected ? "Quitar selección total" : "Seleccionar todas las tarjetas"}
            </button>
          </div>
        ) : null}

        <OperationalCardPicker
          value={scanInput}
          onValueChange={setScanInput}
          onCardSelected={addSelectedCard}
          onMessage={setMessage}
          placeholder="Pistolear codigo o digitar No. TC / Cedula y presionar Enter"
          className="mb-4"
          autoFocus
        />

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
                <th className="px-3 py-2">Procedencia</th>
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
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                        row.dispatchOrigin === "TORRE_POPULAR"
                          ? "bg-blue-100 text-blue-800"
                          : row.dispatchOrigin === "CENTRO_ACOPIO"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {row.dispatchOrigin === "TORRE_POPULAR"
                        ? "🏛️ Torre Popular"
                        : row.dispatchOrigin === "CENTRO_ACOPIO"
                          ? "📦 Centro de acopio"
                          : "⚠️ Sin procedencia"}
                    </span>
                  </td>
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
                    colSpan={mode === "retorno" ? 10 : 9}
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

        {message ? (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-700">✓</span>
              <span>{message}</span>
            </div>
            <button
              onClick={() => setMessage("")}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              Descartar
            </button>
          </div>
        ) : null}
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
            onClick={() => void exportRelation("pdf")}
            disabled={!canExportApproved}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Exportar PDF
          </button>
          <p className="text-xs text-slate-500">
            Exportacion disponible para relaciones aprobadas.
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
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRedactionId(red.id)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                >
                  Agregar tarjetas
                </button>
                <button
                  type="button"
                  onClick={() => void exportRelation("xlsx", red.id)}
                  disabled={red.status !== "APROBADA"}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Excel individual
                </button>
                <button
                  type="button"
                  onClick={() => void exportRelation("pdf", red.id)}
                  disabled={red.status !== "APROBADA"}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  PDF individual
                </button>
              </div>
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

      {editingRedaction ? (
        <EditRedactionModal
          redaction={editingRedaction}
          onClose={() => setEditingRedactionId(null)}
          onSave={async (items) => {
            const ok = await addItemsToRedaction(editingRedaction.id, items);
            if (ok) {
              setEditingRedactionId(null);
            }
          }}
        />
      ) : null}

      {errorWizard ? (
        <RedaccionErrorWizardModal
          error={errorWizard}
          onClose={() => setErrorWizard(null)}
          onSaveCurrentAndSwitchOrigin={handleSaveAndSwitchToCardOrigin}
        />
      ) : null}

      {showDraftsModal ? (
        <RedaccionDraftsModal
          drafts={savedDrafts}
          activeDraftKey={activeDraftKey}
          onSelectDraft={handleSelectDraft}
          onDeleteDraft={(key) => void handleDeleteDraft(key)}
          onCreateNewDraft={handleCreateNewDraft}
          onClose={() => setShowDraftsModal(false)}
        />
      ) : null}

      {showApproveConfirm ? (
        <ApproveConfirmModal
          retornosCount={retornos.length}
          entregasCount={entregas.length}
          zona={zona}
          fecha={fecha}
          draftOrigin={draftOrigin}
          processing={processing}
          onClose={() => setShowApproveConfirm(false)}
          onConfirm={() => void confirmApproveRedaction()}
        />
      ) : null}
    </div>
  );
}

type EditRedactionRow = {
  cardId: string;
  tc: string;
  cedula: string;
  nombre: string;
  isRemote: boolean;
  comentario: string;
};

function EditRedactionModal({
  redaction,
  onClose,
  onSave,
}: {
  redaction: Redaction;
  onClose: () => void;
  onSave: (
    items: Array<{ cardId: string; isRemote?: boolean; comentario?: string }>,
  ) => Promise<void>;
}) {
  const [scanInput, setScanInput] = useState("");
  const [rows, setRows] = useState<EditRedactionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const existingCardIds = useMemo(
    () => new Set(redaction.items.map((item) => item.cardId)),
    [redaction.items],
  );

  function addSelectedCard(card: OperationalCard) {
    if (existingCardIds.has(card.id)) {
      setFeedback("Esa tarjeta ya existe en la relacion");
      return;
    }

    if (rows.some((row) => row.cardId === card.id)) {
      setFeedback("Esa tarjeta ya esta agregada en esta edicion");
      return;
    }

    setRows((prev) => [
      ...prev,
      {
        cardId: card.id,
        tc: card.tc,
        cedula: card.customer.cedula,
        nombre: card.customer.nombre,
        isRemote: Boolean(card.isRemote),
        comentario: "",
      },
    ]);
    setFeedback("");
  }

  async function submit() {
    if (!rows.length) {
      setFeedback("Debes agregar al menos una tarjeta");
      return;
    }
    if (redaction.tipo === "RETORNO") {
      const missingReason = rows.find((row) => !row.comentario.trim());
      if (missingReason) {
        setFeedback(`Debes indicar motivo para la tarjeta ${missingReason.tc}`);
        return;
      }
    }

    setBusy(true);
    setFeedback("");
    await onSave(
      rows.map((row) => ({
        cardId: row.cardId,
        isRemote: row.isRemote,
        comentario: row.comentario.trim() || undefined,
      })),
    );
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">
              Editar relacion {redaction.id.slice(-6)}
            </h3>
            <p className="text-xs text-slate-500">
              {redaction.tipo} · {redaction.status} · tarjetas actuales: {redaction.items.length}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm">
            Cerrar
          </button>
        </div>

        <OperationalCardPicker
          value={scanInput}
          onValueChange={setScanInput}
          onCardSelected={addSelectedCard}
          onMessage={setFeedback}
          placeholder="Pistolear o escribir TC/Cedula y Enter"
          className="mb-3"
          autoFocus
        />

        <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">TC</th>
                <th className="px-3 py-2">Cedula</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Remota</th>
                {redaction.tipo === "RETORNO" ? <th className="px-3 py-2">Motivo</th> : null}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.cardId} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                  <td className="px-3 py-2 font-medium text-blue-700">{row.tc}</td>
                  <td className="px-3 py-2">{row.cedula}</td>
                  <td className="px-3 py-2">{row.nombre}</td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.isRemote}
                      onChange={(event) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.cardId === row.cardId ? { ...item, isRemote: event.target.checked } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  {redaction.tipo === "RETORNO" ? (
                    <td className="px-3 py-2">
                      <input
                        value={row.comentario}
                        onChange={(event) =>
                          setRows((prev) =>
                            prev.map((item) =>
                              item.cardId === row.cardId ? { ...item, comentario: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="Motivo de devolucion"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) => prev.filter((item) => item.cardId !== row.cardId))
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td
                    colSpan={redaction.tipo === "RETORNO" ? 7 : 6}
                    className="px-3 py-8 text-center text-sm text-slate-500"
                  >
                    No hay tarjetas agregadas en esta edicion.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {feedback ? <p className="mt-3 text-sm text-emerald-700">{feedback}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || !rows.length}
            className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ApproveConfirmModalProps = {
  retornosCount: number;
  entregasCount: number;
  zona: string;
  fecha: string;
  draftOrigin: DispatchOrigin | null;
  processing: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function ApproveConfirmModal({
  retornosCount,
  entregasCount,
  zona,
  fecha,
  draftOrigin,
  processing,
  onClose,
  onConfirm,
}: ApproveConfirmModalProps) {
  const total = retornosCount + entregasCount;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm transition-all"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <span className="inline-block rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-800">
            Confirmación de Cierre
          </span>
          <h3 className="mt-0.5 font-display text-base font-bold text-slate-900">
            Aprobar Redacción de Estados
          </h3>
          <p className="text-[11px] text-slate-500">
            Zona {zona} · {dateInputToDisplay(fecha)} · {dispatchOriginLabel(draftOrigin)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          <p className="text-xs leading-relaxed text-slate-600">
            Al aprobar esta redacción, se actualizarán los estados de las siguientes tarjetas en el sistema:
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-2.5 text-center">
              <div className="font-display text-2xl font-extrabold text-rose-700">
                {retornosCount}
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-900">
                → RETORNADAS
              </div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-2.5 text-center">
              <div className="font-display text-2xl font-extrabold text-blue-700">
                {entregasCount}
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-900">
                → ENTREGADAS
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] leading-relaxed text-amber-900">
            ⚠️ <strong>Aviso:</strong> Esta acción aplicará el cambio a{" "}
            <strong>{total} tarjeta(s)</strong> y cerrará la redacción.
          </div>
        </div>

        <div className="shrink-0 flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={processing}
            className="rounded-lg bg-[#0f2544] px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-[#1a3860] disabled:opacity-60"
          >
            {processing ? "Aprobando..." : "✓ Confirmar y actualizar"}
          </button>
        </div>
      </div>
    </div>
  );
}
