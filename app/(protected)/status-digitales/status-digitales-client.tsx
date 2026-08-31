"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowStatusBar } from "@/components/ui/workflow-status-bar";
import { useWorkflowDraft } from "@/lib/use-workflow-draft";
import { usePersistentState } from "@/lib/use-persistent-state";
import { BizcochitosPanel } from "@/components/status-digitales/bizcochitos-panel";
import {
  StatusDigitalSelectionWizardModal,
  type AmbiguousCardOption,
} from "@/components/status-digitales/status-digital-selection-wizard-modal";
import {
  MissingContractWizardModal,
  type MissingContractCardItem,
} from "@/components/status-digitales/missing-contract-wizard-modal";

type ParsedImageRow = {
  fileName: string;
  identifier: string;
  isRemote: boolean;
  overrideCardId?: string;
};

type ProcessedRow = {
  fileName: string;
  identifier: string;
  found: boolean;
  cardId?: string;
  statusBefore?: string;
  statusAfter?: string;
  remoteBefore?: boolean;
  remoteAfter?: boolean;
  action: string;
  options?: AmbiguousCardOption[];
  customer?: {
    nombre: string;
    cedula: string;
  };
  provincia?: string | null;
};

type Summary = {
  filesReceived: number;
  uniqueIdentifiers: number;
  cardsMatched: number;
  cardsNotFound: number;
  closedSkipped: number;
  ambiguous: number;
  updatedToDigital: number;
  keptDelivered: number;
  markedRemote: number;
  unchanged: number;
};

type StatusDigitalDraft = {
  images: ParsedImageRow[];
  rows: ProcessedRow[];
  summary: Summary | null;
};

function parseImageFileName(fileName: string) {
  const noExt = fileName.replace(/\.[^/.]+$/, "").trim();
  const hasRemoteTag = /\(\s*zr\s*\)/i.test(noExt);
  const identifier = noExt
    .replace(/\(\s*zr\s*\)/gi, "")
    .replace(/\(\s*adicional(?:\s+\d+)?\s*\)\s*$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  return { identifier, hasRemoteTag };
}

export default function StatusDigitalesClient() {
  const [activeTab, setActiveTab] = usePersistentState<"PROCESAR" | "BIZCOCHITOS">(
    "status-digitales:tab",
    "PROCESAR",
  );
  const [images, setImages] = useState<ParsedImageRow[]>([]);
  const [rows, setRows] = useState<ProcessedRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [needsReselection, setNeedsReselection] = useState(false);
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [skippedFiles, setSkippedFiles] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTotal, setWizardTotal] = useState(0);
  const [missingContractsModalOpen, setMissingContractsModalOpen] = useState(false);

  const notFound = useMemo(() => rows.filter((row) => !row.found).length, [rows]);
  const unresolvedRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (row.action === "AMBIGUA_REQUIERE_REVISION" || row.action === "NO_ENCONTRADA") &&
          !manualOverrides[row.fileName] &&
          !skippedFiles.has(row.fileName),
      ),
    [rows, manualOverrides, skippedFiles],
  );
  const missingContractRows = useMemo<MissingContractCardItem[]>(() => {
    return rows
      .filter(
        (row) =>
          row.statusAfter === "ENTREGA_DIGITAL_SIN_CONTRATO" ||
          row.action?.includes("SIN_CONTRATO_PENDIENTE"),
      )
      .map((row) => ({
        fileName: row.fileName,
        identifier: row.identifier,
        tc: row.identifier,
        nombre: row.customer?.nombre ?? null,
        cedula: row.customer?.cedula ?? null,
        provincia: row.provincia ?? null,
      }));
  }, [rows]);
  const draftPayload = useMemo<StatusDigitalDraft>(
    () => ({ images, rows, summary }),
    [images, rows, summary],
  );
  const workflowDraft = useWorkflowDraft<StatusDigitalDraft>({
    module: "status-digitales",
    payload: draftPayload,
    shouldSave: Boolean(images.length || rows.length),
    onRestore: (draft) => {
      setImages(draft.images);
      setRows(draft.rows);
      setSummary(draft.summary);
      setNeedsReselection(Boolean(draft.images.length));
      setMessage(
        draft.rows.length
          ? "Resultados recuperados. Vuelve a seleccionar los archivos solo si deseas reprocesarlos."
          : "Progreso recuperado. Vuelve a seleccionar los archivos antes de procesar.",
      );
    },
  });

  function onSelectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const parsed = files
      .map((file) => {
        const parsedName = parseImageFileName(file.name);
        return {
          fileName: file.name,
          identifier: parsedName.identifier,
          isRemote: parsedName.hasRemoteTag,
        };
      })
      .filter((item) => item.identifier);

    setImages(parsed);
    setRows([]);
    setSummary(null);
    setNeedsReselection(false);
    setManualOverrides({});
    setSkippedFiles(new Set());
    setMessage(parsed.length ? `${parsed.length} imagen(es) listas para procesar` : "No se detectaron nombres validos");
  }

  async function processImages(overrides?: Record<string, string>) {
    if (!images.length) {
      setMessage("Selecciona imagenes primero");
      return;
    }
    if (needsReselection) {
      setMessage("Vuelve a seleccionar los archivos para autorizar su procesamiento.");
      return;
    }

    const effectiveOverrides = overrides ?? manualOverrides;
    const items = images.map((item) => ({
      ...item,
      overrideCardId: effectiveOverrides[item.fileName],
    }));

    setProcessing(true);
    setMessage("");
    const res = await fetch("/api/status-digitales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const json = await res.json().catch(() => ({ error: "No se pudo procesar status digitales" }));

    if (!res.ok) {
      setMessage(json.error ?? "No se pudo procesar status digitales");
      setProcessing(false);
      return;
    }

    const nextRows = (json.rows ?? []) as ProcessedRow[];
    setRows(nextRows);
    setSummary((json.summary ?? null) as Summary | null);
    setMessage("Status digitales procesados");
    setProcessing(false);

    const pendingContracts = nextRows.filter(
      (row) =>
        row.statusAfter === "ENTREGA_DIGITAL_SIN_CONTRATO" ||
        row.action?.includes("SIN_CONTRATO_PENDIENTE"),
    );
    if (pendingContracts.length) {
      setMissingContractsModalOpen(true);
    }

    const stillPending = nextRows.filter(
      (row) =>
        (row.action === "AMBIGUA_REQUIERE_REVISION" || row.action === "NO_ENCONTRADA") &&
        !effectiveOverrides[row.fileName] &&
        !skippedFiles.has(row.fileName),
    );
    if (stillPending.length) {
      setWizardTotal(stillPending.length);
      setWizardOpen(true);
    }
  }

  function resolveWizardRow(fileName: string, cardId: string) {
    setManualOverrides((prev) => ({ ...prev, [fileName]: cardId }));
  }

  function skipWizardRow(fileName: string) {
    setSkippedFiles((prev) => new Set(prev).add(fileName));
  }

  function applyWizardSelections() {
    setWizardOpen(false);
    void processImages(manualOverrides);
  }

  if (activeTab === "BIZCOCHITOS") {
    return (
      <div>
        <PageHeader
          title="Entregas digitales"
          subtitle="Procesamiento por imágenes y lotes bancarios Bizcochito"
        />
        <DigitalTabs activeTab={activeTab} onChange={setActiveTab} />
        <BizcochitosPanel />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Entregas digitales"
        subtitle="Procesamiento por imágenes y lotes bancarios Bizcochito"
      />
      <DigitalTabs activeTab={activeTab} onChange={setActiveTab} />
      <WorkflowStatusBar
        status={workflowDraft.status}
        updatedAt={workflowDraft.updatedAt}
        onUseRemote={workflowDraft.useRemoteVersion}
        onOverwrite={workflowDraft.overwriteRemote}
      />

      <Panel>
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Seleccionar imagenes</p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onSelectFiles}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">
            Reglas: <code>(ZR)</code> marca zona remota. <code>(ADICIONAL)</code> y <code>(ADICIONAL 2)</code> al final
            seleccionan tarjetas adicionales por nombre/cédula y fecha de despacho.
          </p>
          {needsReselection ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Los navegadores no restauran archivos locales por seguridad. Selecciónalos otra vez para reprocesar.
            </p>
          ) : null}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void processImages()}
            disabled={processing || !images.length}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {processing ? "Procesando..." : `Procesar (${images.length})`}
          </button>
          <button
            type="button"
            onClick={() => {
              setImages([]);
              setRows([]);
              setSummary(null);
              setNeedsReselection(false);
              setManualOverrides({});
              setSkippedFiles(new Set());
              setWizardOpen(false);
              setMessage("");
              void workflowDraft.clearDraft();
            }}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            Limpiar
          </button>
          {unresolvedRows.length ? (
            <button
              type="button"
              onClick={() => {
                setWizardTotal(unresolvedRows.length);
                setWizardOpen(true);
              }}
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
            >
              Resolver pendientes ({unresolvedRows.length})
            </button>
          ) : null}
          {missingContractRows.length ? (
            <button
              type="button"
              onClick={() => setMissingContractsModalOpen(true)}
              className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-xs"
            >
              Tarjetas sin contrato ({missingContractRows.length})
            </button>
          ) : null}
        </div>

        {summary ? (
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Archivos" value={summary.filesReceived} />
            <Stat label="Coinciden" value={summary.cardsMatched} />
            <Stat label="No encontradas" value={summary.cardsNotFound} />
            <Stat label="Omitidas cerradas" value={summary.closedSkipped ?? 0} />
            <Stat label="Ambiguas para revision" value={summary.ambiguous ?? 0} />
            <Stat label="A digital" value={summary.updatedToDigital} />
            <Stat label="Entregadas intactas" value={summary.keptDelivered} />
            <Stat label="Marcadas ZR" value={summary.markedRemote} />
            <Stat label="Sin cambios" value={summary.unchanged} />
            <Stat label="Ids unicos" value={summary.uniqueIdentifiers} />
          </div>
        ) : null}

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel className="mt-5" title={`Resultado por archivo${rows.length ? ` (${rows.length})` : ""}`}>
        <div className="mb-3 text-xs text-slate-500">
          No encontradas: {summary?.cardsNotFound ?? notFound}
          {summary ? (
            <>
              {" | "}Omitidas por tarjeta cerrada: {summary.closedSkipped ?? 0}
              {" | "}Ambiguas para revision: {summary.ambiguous ?? 0}
            </>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Archivo</th>
                <th className="pb-2">Tarjeta</th>
                <th className="pb-2">Estado anterior</th>
                <th className="pb-2">Estado nuevo</th>
                <th className="pb-2">Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.fileName}-${index}`} className="border-t border-slate-100">
                  <td className="py-2">{row.fileName}</td>
                  <td className="py-2 font-medium text-blue-700">{row.identifier}</td>
                  <td className="py-2">
                    {row.found && row.statusBefore ? <StatusBadge value={row.statusBefore} /> : "-"}
                  </td>
                  <td className="py-2">
                    {row.found && row.statusAfter ? <StatusBadge value={row.statusAfter} /> : "-"}
                  </td>
                  <td className="py-2">{formatAction(row.action)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                    Aun no hay resultados para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      {wizardOpen ? (
        <StatusDigitalSelectionWizardModal
          pending={unresolvedRows.map((row) => ({
            fileName: row.fileName,
            identifier: row.identifier,
            action: row.action as "AMBIGUA_REQUIERE_REVISION" | "NO_ENCONTRADA",
            options: row.options,
          }))}
          resolvedCount={Math.max(0, wizardTotal - unresolvedRows.length)}
          totalCount={wizardTotal}
          onResolve={resolveWizardRow}
          onSkip={skipWizardRow}
          onClose={() => setWizardOpen(false)}
          onApply={applyWizardSelections}
        />
      ) : null}

      {missingContractsModalOpen && missingContractRows.length ? (
        <MissingContractWizardModal
          items={missingContractRows}
          onClose={() => setMissingContractsModalOpen(false)}
          onConfirm={() => setMissingContractsModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DigitalTabs({
  activeTab,
  onChange,
}: {
  activeTab: "PROCESAR" | "BIZCOCHITOS";
  onChange: (tab: "PROCESAR" | "BIZCOCHITOS") => void;
}) {
  return (
    <div
      className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      role="tablist"
      aria-label="Secciones de entregas digitales"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "PROCESAR"}
        onClick={() => onChange("PROCESAR")}
        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
          activeTab === "PROCESAR"
            ? "bg-[#0f2544] text-white"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        Procesar imágenes
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "BIZCOCHITOS"}
        onClick={() => onChange("BIZCOCHITOS")}
        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
          activeTab === "BIZCOCHITOS"
            ? "bg-amber-100 text-amber-950"
            : "text-slate-600 hover:bg-amber-50"
        }`}
      >
        Bizcochitos
      </button>
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

function formatAction(action: string) {
  if (action === "OMITIDA_TARJETA_CERRADA") return "Omitida: tarjeta cerrada";
  if (action === "AMBIGUA_REQUIERE_REVISION") return "Ambigua: requiere revision";
  if (action === "NO_ENCONTRADA") return "No encontrada";
  return action.replaceAll("_", " ");
}
