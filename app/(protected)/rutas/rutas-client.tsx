"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  OperationalCardPicker,
  type OperationalCard,
} from "@/components/cards/operational-card-picker";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowStatusBar } from "@/components/ui/workflow-status-bar";
import { RouteProgressPanel } from "@/components/rutas/route-progress-panel";
import { ContractDeliveryWizardModal } from "@/components/rutas/contract-delivery-wizard-modal";
import { getRouteLifecycle } from "@/lib/route-item-lifecycle";
import { resolveReturnReasonPrompt } from "@/lib/return-reason-prompt";
import { resolveOperativoTab, type OperativoTab } from "@/lib/rutas-operativo-tab";
import { resolveContractIdentifiers } from "@/lib/route-contract-selection";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useWorkflowDraft } from "@/lib/use-workflow-draft";

type Messenger = { id: string; nombre: string };
type ProvinceRow = { id: string; nombre: string; zona: string; active: boolean };
type ReturnReasonRow = { id: string; nombre: string; active: boolean };
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

type ScanCandidate = {
  itemId: string;
  cardId: string | null;
  tc: string;
  cedula: string | null;
  nombre: string | null;
  status: string | null;
  dispatchDate: string | null;
  returnReason: string | null;
};

type ScanConflict = {
  // SDD contrato-tarjetas-pistoleo (design D2): `SIN_CONTRATO_REQUIERE_CONFIRMACION`
  // reuses the exact same 409-conflict envelope shape as `SOLO_CERRADAS`.
  kind: "REQUIERE_SELECCION" | "SOLO_CERRADAS" | "SIN_CONTRATO_REQUIERE_CONFIRMACION";
  candidates: ScanCandidate[];
};

type ScanEndpointResult =
  | { success: true; scanned: { tc: string; cedula: string | null; nombre: string | null } }
  | { success: false; error: string; conflict: ScanConflict | null };

type RoutesDraft = {
  moduleTab: ModuleTab;
  operativoTab: OperativoTab;
  fecha: string;
  messengerId: string;
  identifiers: string;
  selectedRouteId: string;
  selectedRouteForLot: string | null;
  selectedLotTrackingId: string | null;
  scanInput: string;
  scanResult: ScanResult | null;
  scanStatus: "EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA";
  scanComment: string;
  showNewLot: boolean;
  lotMessengerId: string;
  lotDestinationProvince: string;
  lotFechaEnvio: string;
  lotIdentifiers: string;
  routeSelectedCards: OperationalCard[];
  lotSelectedCards: OperationalCard[];
};

type ModuleTab = "operativo" | "lotes";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-DO");
}

function isClosedOperationalCard(card: Pick<OperationalCard, "status">) {
  return card.status === "RETORNADA" || card.status === "DEVUELTA_TIENDA";
}

function getScanConflict(data: unknown): ScanConflict | null {
  const payload = asRecord(data);
  if (
    payload.kind !== "REQUIERE_SELECCION" &&
    payload.kind !== "SOLO_CERRADAS" &&
    payload.kind !== "SIN_CONTRATO_REQUIERE_CONFIRMACION"
  ) {
    return null;
  }
  if (!Array.isArray(payload.candidates)) {
    return null;
  }

  const candidates = payload.candidates.flatMap((value) => {
    const candidate = asRecord(value);
    if (typeof candidate.itemId !== "string" || typeof candidate.tc !== "string") return [];
    return [
      {
        itemId: candidate.itemId,
        cardId: typeof candidate.cardId === "string" ? candidate.cardId : null,
        tc: candidate.tc,
        cedula: typeof candidate.cedula === "string" ? candidate.cedula : null,
        nombre: typeof candidate.nombre === "string" ? candidate.nombre : null,
        status: typeof candidate.status === "string" ? candidate.status : null,
        dispatchDate: typeof candidate.dispatchDate === "string" ? candidate.dispatchDate : null,
        returnReason: typeof candidate.returnReason === "string" ? candidate.returnReason : null,
      },
    ];
  });

  return { kind: payload.kind, candidates };
}

function ScanResolutionPanel({
  conflict,
  onSelect,
  onDismiss,
}: {
  conflict: ScanConflict;
  onSelect: (candidate: ScanCandidate) => void;
  onDismiss: () => void;
}) {
  const isClosed = conflict.kind === "SOLO_CERRADAS";
  const isMissingContract = conflict.kind === "SIN_CONTRATO_REQUIERE_CONFIRMACION";

  return (
    <div
      className={`mt-3 rounded-xl border p-3 ${
        isClosed || isMissingContract ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {isClosed
              ? "La coincidencia esta cerrada"
              : isMissingContract
                ? "Esta tarjeta requiere contrato y aun no tiene la imagen registrada"
                : "Hay varias tarjetas vigentes"}
          </p>
          <p className="mt-1 text-xs text-slate-700">
            {isClosed
              ? "Confirma explicitamente una tarjeta cerrada antes de actualizarla."
              : isMissingContract
                ? "Confirma para marcarla entregada sin contrato; quedara pendiente en el modulo Contratos pendientes."
                : "Selecciona explicitamente la tarjeta que corresponde al pistoleo."}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
        >
          Cancelar
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        {conflict.candidates.map((candidate) => (
          <button
            key={candidate.itemId}
            type="button"
            onClick={() => onSelect(candidate)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400"
          >
            <span className="font-semibold text-blue-800">TC {candidate.tc}</span>
            <span className="ml-2 text-slate-700">{candidate.nombre ?? "Sin cliente"}</span>
            <span className="mt-1 block text-xs text-slate-600">
              Cedula: {candidate.cedula ?? "-"} | Estado: {candidate.status ?? "-"} | Despacho: {formatDate(candidate.dispatchDate)}
            </span>
            {candidate.returnReason ? (
              <span className="mt-1 block text-xs text-rose-700">
                Motivo de devolucion: {candidate.returnReason}
              </span>
            ) : null}
            <span
              className={`mt-2 block text-xs font-semibold ${
                isClosed || isMissingContract ? "text-amber-800" : "text-blue-800"
              }`}
            >
              {isClosed
                ? "Confirmar tarjeta cerrada"
                : isMissingContract
                  ? "Confirmar entrega sin contrato"
                  : "Usar esta tarjeta"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedOperationalCardChips({
  cards,
  onRemove,
  contractCardIds,
  onToggleContract,
  onToggleAllContracts,
  onClearAll,
}: {
  cards: OperationalCard[];
  onRemove: (cardId: string) => void;
  // SDD contrato-tarjetas-pistoleo: per-card "requiere contrato" checkbox
  contractCardIds?: ReadonlySet<string>;
  onToggleContract?: (cardId: string) => void;
  onToggleAllContracts?: (enable: boolean) => void;
  onClearAll?: () => void;
}) {
  if (!cards.length) return null;

  const totalCards = cards.length;
  const contractCount = contractCardIds
    ? cards.filter((c) => contractCardIds.has(c.id)).length
    : 0;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3" aria-label="Tarjetas seleccionadas">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <span className="inline-flex items-center justify-center rounded-full bg-[#0f2544] px-2 py-0.5 text-[11px] font-bold text-white">
            {totalCards}
          </span>
          <span>{totalCards === 1 ? "Tarjeta seleccionada" : "Tarjetas seleccionadas"}</span>
          {onToggleContract ? (
            <span className="text-slate-500 font-normal">
              ({contractCount} con contrato)
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {onToggleContract && onToggleAllContracts && cards.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => onToggleAllContracts(true)}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition"
              >
                Marcar todas
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => onToggleAllContracts(false)}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 transition"
              >
                Desmarcar todas
              </button>
              <span className="text-slate-300">|</span>
            </>
          ) : null}
          {onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50 transition"
            >
              Limpiar
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-2.5 max-h-56 overflow-y-auto space-y-1.5 pr-1">
        {cards.map((card) => (
          <div
            key={card.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-900 truncate">{card.tc}</span>
                <span className="text-slate-700 truncate">{card.customer.nombre}</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Cédula: {card.customer.cedula || "-"} · Zona: {card.zona || "Metro"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {onToggleContract ? (
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-slate-700 hover:text-blue-800 select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={contractCardIds?.has(card.id) ?? false}
                    onChange={() => onToggleContract(card.id)}
                    aria-label={`Requiere contrato: tarjeta ${card.tc}`}
                  />
                  <span>Contrato</span>
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(card.id)}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                aria-label={`Quitar tarjeta ${card.tc}`}
                title="Quitar de la lista"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  const [moduleTab, setModuleTab] = usePersistentState<ModuleTab>(
    "rutas:module-tab",
    "operativo",
  );
  // Reuses the pre-existing "rutas:lot-tab" storage key: the route-progress
  // sub-tab this drives used to live under the "Lotes" module tab. Returning
  // users may still have a stale value ("lotes"/"seguimiento") persisted
  // under this key; resolveOperativoTab coerces anything outside the current
  // domain to the default instead of rendering neither sub-tab panel.
  const [operativoTabRaw, setOperativoTab] = usePersistentState<OperativoTab>(
    "rutas:lot-tab",
    "asignacion",
  );
  const operativoTab = resolveOperativoTab(operativoTabRaw);

  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [provinces, setProvinces] = useState<ProvinceRow[]>([]);
  const [returnReasons, setReturnReasons] = useState<string[]>([]);
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
  const [routePage, setRoutePage] = usePersistentState("rutas:route-page", 1);
  const [lotPage, setLotPage] = usePersistentState("rutas:lot-page", 1);

  const [fecha, setFecha] = usePersistentState(
    "rutas:fecha",
    new Date().toISOString().slice(0, 10),
  );
  const [messengerId, setMessengerId] = usePersistentState("rutas:messenger", "");
  const [identifiers, setIdentifiers] = useState("");
  // SDD contrato-tarjetas-pistoleo (verify-report id 614 fix): per-card
  // "requiere contrato" selection, replacing the removed all-or-nothing
  // batch checkbox. Holds the ids of picker-resolved cards
  // (`routeSelectedCards`) explicitly marked by the analyst; only
  // picker-resolved cards get a checkbox (see `SelectedOperationalCardChips`)
  // since the free-text textarea has no per-line UI to attach one to.
  const [contractCardIds, setContractCardIds] = useState<Set<string>>(new Set());
  const [routePickerValue, setRoutePickerValue] = useState("");
  const [routeSelectedCards, setRouteSelectedCards] = useState<OperationalCard[]>([]);
  const [selectedRouteId, setSelectedRouteId] = usePersistentState("rutas:selected-route", "");
  const [selectedRouteForLot, setSelectedRouteForLot] = usePersistentState<string | null>(
    "rutas:selected-route-lot",
    null,
  );
  const [selectedLotTrackingId, setSelectedLotTrackingId] = usePersistentState<string | null>(
    "rutas:selected-lot-tracking",
    null,
  );

  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [routeScanConflict, setRouteScanConflict] = useState<ScanConflict | null>(null);
  const [scanStatus, setScanStatus] = usePersistentState<
    "EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA"
  >("rutas:scan-status", "ACUSE_RECIBIDO");
  const [scanComment, setScanComment] = useState("");

  const [showNewLot, setShowNewLot] = usePersistentState("rutas:show-new-lot", false);
  const [lotMessengerId, setLotMessengerId] = usePersistentState("rutas:lot-messenger", "");
  const [lotDestinationProvince, setLotDestinationProvince] = usePersistentState(
    "rutas:lot-province",
    "",
  );
  const [lotFechaEnvio, setLotFechaEnvio] = usePersistentState(
    "rutas:lot-date",
    new Date().toISOString().slice(0, 10),
  );
  const [lotIdentifiers, setLotIdentifiers] = useState("");
  const [lotPickerValue, setLotPickerValue] = useState("");
  const [lotSelectedCards, setLotSelectedCards] = useState<OperationalCard[]>([]);

  const [message, setMessage] = useState("");
  const [savingNewLot, setSavingNewLot] = useState(false);

  const draftPayload = useMemo<RoutesDraft>(
    () => ({
      moduleTab,
      operativoTab,
      fecha,
      messengerId,
      identifiers,
      selectedRouteId,
      selectedRouteForLot,
      selectedLotTrackingId,
      scanInput,
      scanResult,
      scanStatus,
      scanComment,
      showNewLot,
      lotMessengerId,
      lotDestinationProvince,
      lotFechaEnvio,
      lotIdentifiers,
      routeSelectedCards,
      lotSelectedCards,
    }),
    [
      fecha,
      identifiers,
      lotDestinationProvince,
      lotFechaEnvio,
      lotIdentifiers,
      lotMessengerId,
      messengerId,
      moduleTab,
      operativoTab,
      lotSelectedCards,
      routeSelectedCards,
      scanComment,
      scanInput,
      scanResult,
      scanStatus,
      selectedLotTrackingId,
      selectedRouteForLot,
      selectedRouteId,
      showNewLot,
    ],
  );
  const workflowDraft = useWorkflowDraft<RoutesDraft>({
    module: "rutas",
    payload: draftPayload,
    shouldSave: Boolean(
      identifiers.trim() ||
        scanInput.trim() ||
        scanComment.trim() ||
        lotIdentifiers.trim() ||
        routeSelectedCards.length ||
        lotSelectedCards.length,
    ),
    onRestore: (draft) => {
      setModuleTab(draft.moduleTab);
      setOperativoTab(draft.operativoTab);
      setFecha(draft.fecha);
      setMessengerId(draft.messengerId);
      setIdentifiers(draft.identifiers);
      setSelectedRouteId(draft.selectedRouteId);
      setSelectedRouteForLot(draft.selectedRouteForLot);
      setSelectedLotTrackingId(draft.selectedLotTrackingId);
      setScanInput(draft.scanInput);
      setScanResult(draft.scanResult);
      setScanStatus(draft.scanStatus);
      setScanComment(draft.scanComment);
      setShowNewLot(draft.showNewLot);
      setLotMessengerId(draft.lotMessengerId);
      setLotDestinationProvince(draft.lotDestinationProvince);
      setLotFechaEnvio(draft.lotFechaEnvio);
      setLotIdentifiers(draft.lotIdentifiers);
      setRouteSelectedCards(draft.routeSelectedCards ?? []);
      setLotSelectedCards(draft.lotSelectedCards ?? []);
    },
  });

  function addSelectedRouteCard(card: OperationalCard) {
    if (isClosedOperationalCard(card)) {
      setMessage("Las tarjetas retornadas o devueltas no se pueden asignar a una nueva ruta");
      return;
    }
    if (routeSelectedCards.some((item) => item.id === card.id)) {
      setMessage("La tarjeta ya esta seleccionada para la ruta");
      return;
    }
    setRouteSelectedCards((previous) => [...previous, card]);
    setMessage("");
  }

  function addSelectedRouteCards(newCards: OperationalCard[]) {
    const valid = newCards.filter(
      (card) =>
        !isClosedOperationalCard(card) &&
        !routeSelectedCards.some((item) => item.id === card.id),
    );
    if (!valid.length) {
      setMessage("Las tarjetas ya están seleccionadas o se encuentran cerradas.");
      return;
    }
    setRouteSelectedCards((previous) => {
      const existingIds = new Set(previous.map((c) => c.id));
      const additions = valid.filter((c) => !existingIds.has(c.id));
      return [...previous, ...additions];
    });
    setMessage(`Se agregaron ${valid.length} tarjeta(s) a la ruta`);
  }

  function toggleAllRouteContracts(enable: boolean) {
    if (enable) {
      setContractCardIds(new Set(routeSelectedCards.map((c) => c.id)));
    } else {
      setContractCardIds(new Set());
    }
  }

  function clearAllRouteCards() {
    setRouteSelectedCards([]);
    setContractCardIds(new Set());
    setMessage("");
  }

  function removeSelectedRouteCard(cardId: string) {
    setRouteSelectedCards((previous) => previous.filter((card) => card.id !== cardId));
    setContractCardIds((previous) => {
      if (!previous.has(cardId)) return previous;
      const next = new Set(previous);
      next.delete(cardId);
      return next;
    });
  }

  function toggleContractCard(cardId: string) {
    setContractCardIds((previous) => {
      const next = new Set(previous);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  function addSelectedLotCard(card: OperationalCard) {
    if (isClosedOperationalCard(card)) {
      setMessage("Las tarjetas retornadas o devueltas no se pueden asignar a un nuevo lote");
      return;
    }
    if (lotSelectedCards.some((item) => item.id === card.id)) {
      setMessage("La tarjeta ya esta seleccionada para el lote");
      return;
    }
    setLotSelectedCards((previous) => [...previous, card]);
    setMessage("");
  }

  function addSelectedLotCards(newCards: OperationalCard[]) {
    const valid = newCards.filter(
      (card) =>
        !isClosedOperationalCard(card) &&
        !lotSelectedCards.some((item) => item.id === card.id),
    );
    if (!valid.length) {
      setMessage("Las tarjetas ya están seleccionadas o se encuentran cerradas.");
      return;
    }
    setLotSelectedCards((previous) => {
      const existingIds = new Set(previous.map((c) => c.id));
      const additions = valid.filter((c) => !existingIds.has(c.id));
      return [...previous, ...additions];
    });
    setMessage(`Se agregaron ${valid.length} tarjeta(s) al lote`);
  }

  function clearAllLotCards() {
    setLotSelectedCards([]);
    setMessage("");
  }

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

  async function loadReturnReasons() {
    const res = await fetch("/api/config/motivos-retorno", { cache: "no-store" });
    const json = await res.json();
    const list = (json.motivos ?? [])
      .filter((item: ReturnReasonRow) => item.active)
      .map((item: ReturnReasonRow) => item.nombre);
    setReturnReasons(list);
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
    void Promise.all([loadMessengers(), loadProvinces(), loadReturnReasons()]);
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

    const cardsToSubmit = [...routeSelectedCards];
    const contractsToSubmit = new Set(contractCardIds);

    // If there is still un-added text in the picker input, attempt to resolve it
    const pendingText = routePickerValue.trim();
    if (pendingText) {
      const tokens = pendingText.split(/[\n,;]+/g).map((t) => t.trim()).filter(Boolean);
      if (tokens.length > 0) {
        try {
          const resp = await fetch("/api/tarjetas/busqueda-operativa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifiers: tokens }),
          });
          const payload = await resp.json().catch(() => null);
          if (resp.ok && Array.isArray(payload?.results)) {
            for (const item of payload.results) {
              if (
                item.resolution?.kind === "RESUELTA" &&
                !cardsToSubmit.some((c) => c.id === item.resolution.card.id)
              ) {
                cardsToSubmit.push(item.resolution.card);
              }
            }
          }
        } catch {
          // continue with current cards
        }
      }
    }

    const parsed = Array.from(new Set(cardsToSubmit.map((card) => card.id)));

    if (!parsed.length) {
      setMessage("Pistolea o ingresa al menos una tarjeta para crear la ruta");
      return;
    }

    const res = await fetch("/api/rutas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha,
        messengerId,
        identifiers: parsed,
        contractIdentifiers: resolveContractIdentifiers(parsed, contractsToSubmit),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) {
        setMessage(
          "Hay tarjetas ambiguas o cerradas. Selecciona una vigente con el selector y retira las cerradas antes de crear la ruta.",
        );
        return;
      }
      setMessage(data.error ?? "No se pudo crear ruta");
      return;
    }

    setMessage(`Ruta creada con ${data.route.items.length} tarjetas`);
    setIdentifiers("");
    setContractCardIds(new Set());
    setRoutePickerValue("");
    setRouteSelectedCards([]);
    setRoutePage(1);
    await loadRoutes(1);
    setSelectedRouteId(data.route.id);
    await workflowDraft.clearDraft();
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

  async function scanCard(selection?: {
    itemId: string;
    confirmClosed?: boolean;
    confirmMissingContract?: boolean;
  }) {
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
        itemId: selection?.itemId,
        confirmClosed: selection?.confirmClosed,
        confirmMissingContract: selection?.confirmMissingContract,
        result: scanStatus,
        comentario: scanComment || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const conflict = res.status === 409 ? getScanConflict(data) : null;
      if (conflict) {
        setRouteScanConflict(conflict);
        setMessage("");
        return;
      }
      setRouteScanConflict(null);
      setMessage(data.error ?? "No se pudo pistolear");
      return;
    }

    setRouteScanConflict(null);
    setScanResult(data.scanned);
    setScanInput("");
    setScanComment("");
    setMessage(`Tarjeta ${data.scanned.tc} actualizada a ${scanStatus}`);
    await workflowDraft.clearDraft();
    await Promise.all([loadRoutes(routePage), loadLots(lotPage)]);
  }

  async function scanLotTrackingCard(
    lotId: string,
    identifier: string,
    selection?: { itemId: string; confirmClosed?: boolean },
  ): Promise<ScanEndpointResult> {
    const res = await fetch("/api/lotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SCAN_ITEM",
        lotId,
        identifier,
        itemId: selection?.itemId,
        confirmClosed: selection?.confirmClosed,
        result: "ACUSE_RECIBIDO",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: typeof data.error === "string" ? data.error : "No se pudo pistolear la tarjeta del lote",
        conflict: res.status === 409 ? getScanConflict(data) : null,
      };
    }

    await Promise.all([loadRoutes(routePage), loadLots(lotPage)]);
    return {
      success: true,
      scanned: {
        tc: typeof data.scanned?.tc === "string" ? data.scanned.tc : identifier,
        cedula: typeof data.scanned?.cedula === "string" ? data.scanned.cedula : null,
        nombre: typeof data.scanned?.nombre === "string" ? data.scanned.nombre : null,
      },
    };
  }

  async function markRouteItem(
    itemId: string,
    result: "EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA",
    comentario?: string,
    options?: { silent?: boolean; skipRefresh?: boolean },
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
      if (!options?.silent) {
        setMessage(data.error ?? "No se pudo actualizar tarjeta de ruta");
      }
      return;
    }
    if (!options?.silent) {
      setMessage(`Tarjeta marcada como ${result}`);
    }
    if (!options?.skipRefresh) {
      await Promise.all([loadRoutes(routePage), loadLots(lotPage)]);
    }
  }

  async function markLotTrackingItem(
    lotItemId: string,
    result: "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA" | "EN_RUTA",
    comentario?: string,
    options?: { silent?: boolean; skipRefresh?: boolean },
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
      if (!options?.silent) {
        setMessage(data.error ?? "No se pudo actualizar item de lote");
      }
      return;
    }
    if (!options?.silent) {
      setMessage(
        `Item de lote actualizado: ${
          result === "ACUSE_RECIBIDO"
            ? "ACUSE RECIBIDO"
            : result === "DEVUELTA_TIENDA"
              ? "DEVUELTA A TIENDA"
              : "EN RUTA"
        }`,
      );
    }
    if (!options?.skipRefresh) {
      await Promise.all([loadRoutes(routePage), loadLots(lotPage)]);
    }
  }

  async function createLot() {
    setSavingNewLot(true);
    if (!lotMessengerId || !lotDestinationProvince) {
      setMessage("Selecciona mensajero y provincia destino");
      setSavingNewLot(false);
      return;
    }

    const cardsToSubmit = [...lotSelectedCards];
    const pendingText = lotPickerValue.trim();
    if (pendingText) {
      const tokens = pendingText.split(/[\n,;]+/g).map((t) => t.trim()).filter(Boolean);
      if (tokens.length > 0) {
        try {
          const resp = await fetch("/api/tarjetas/busqueda-operativa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifiers: tokens }),
          });
          const payload = await resp.json().catch(() => null);
          if (resp.ok && Array.isArray(payload?.results)) {
            for (const item of payload.results) {
              if (
                item.resolution?.kind === "RESUELTA" &&
                !cardsToSubmit.some((c) => c.id === item.resolution.card.id)
              ) {
                cardsToSubmit.push(item.resolution.card);
              }
            }
          }
        } catch {
          // continue with current cards
        }
      }
    }

    const parsedIdentifiers = Array.from(new Set(cardsToSubmit.map((card) => card.id)));

    if (!parsedIdentifiers.length) {
      setMessage("Pistolea o ingresa al menos una tarjeta para el lote");
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
      if (res.status === 409) {
        setMessage(
          "Hay tarjetas ambiguas o cerradas. Selecciona una vigente con el selector y retira las cerradas antes de crear el lote.",
        );
        setSavingNewLot(false);
        return;
      }
      setMessage(data.error ?? "No se pudo crear lote");
      setSavingNewLot(false);
      return;
    }

    setSavingNewLot(false);
    setShowNewLot(false);
    setLotIdentifiers("");
    setLotPickerValue("");
    setLotSelectedCards([]);
    setMessage(`Lote ${data.lot?.lotNumber ?? ""} creado`);
    await workflowDraft.clearDraft();
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

  async function requestReturnReason(existing?: string | null): Promise<string | null> {
    // Interim sync->async plumbing (SDD `rutas-lotes-redesign`, Slice 4b, task
    // 4.7): still resolves via `window.prompt()`, wrapped in `Promise.resolve()`.
    // The styled input+datalist replacement (spec requirement "No native
    // prompt on reason capture") is Slice 7a's job, not this batch's.
    const promptValue = await Promise.resolve(
      window.prompt("Indica el motivo de devolucion", existing?.trim() ?? ""),
    );
    const resolved = resolveReturnReasonPrompt(promptValue);
    if (resolved.message) setMessage(resolved.message);
    return resolved.reason;
  }

  return (
    <div>
      <PageHeader
        title="Rutas"
        subtitle="Asignacion de rutas, lotes y gestion de acuses de mensajeros"
      />
      <WorkflowStatusBar
        status={workflowDraft.status}
        updatedAt={workflowDraft.updatedAt}
        onUseRemote={workflowDraft.useRemoteVersion}
        onOverwrite={workflowDraft.overwriteRemote}
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
        <div>
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setOperativoTab("asignacion")}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                operativoTab === "asignacion"
                  ? "border-blue-700 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              Asignacion y pistoleo
            </button>
            <button
              onClick={() => setOperativoTab("progreso")}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                operativoTab === "progreso"
                  ? "border-blue-700 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              Progreso de rutas
            </button>
          </div>

          {operativoTab === "asignacion" ? (
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
                  Pistolear o ingresar tarjetas
                </label>
                <OperationalCardPicker
                  value={routePickerValue}
                  onValueChange={setRoutePickerValue}
                  onCardSelected={addSelectedRouteCard}
                  onCardsSelected={addSelectedRouteCards}
                  onMessage={setMessage}
                  placeholder="Pistolear TC/Cédula, escribir o pegar en lote..."
                  buttonLabel="Agregar"
                  inputLabel="Agregar tarjeta resuelta a la ruta"
                />
                <SelectedOperationalCardChips
                  cards={routeSelectedCards}
                  onRemove={removeSelectedRouteCard}
                  contractCardIds={contractCardIds}
                  onToggleContract={toggleContractCard}
                  onToggleAllContracts={toggleAllRouteContracts}
                  onClearAll={clearAllRouteCards}
                />
              </div>
              <button
                type="submit"
                disabled={!routeSelectedCards.length && !routePickerValue.trim()}
                className="w-full rounded-xl bg-[#0f2544] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#153460] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Crear ruta {routeSelectedCards.length ? `(${routeSelectedCards.length})` : ""}
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
                      onChange={(event) => {
                        setScanInput(event.target.value);
                        setRouteScanConflict(null);
                      }}
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

                  {routeScanConflict ? (
                    routeScanConflict.kind === "SIN_CONTRATO_REQUIERE_CONFIRMACION" &&
                    routeScanConflict.candidates[0] ? (
                      <ContractDeliveryWizardModal
                        candidate={routeScanConflict.candidates[0]}
                        onClose={() => setRouteScanConflict(null)}
                        onConfirmWithoutContract={() => {
                          const candidate = routeScanConflict.candidates[0];
                          setRouteScanConflict(null);
                          void scanCard({
                            itemId: candidate.itemId,
                            confirmMissingContract: true,
                          });
                        }}
                        onConfirmWithContract={() => {
                          const candidate = routeScanConflict.candidates[0];
                          setRouteScanConflict(null);
                          void scanCard({
                            itemId: candidate.itemId,
                            confirmMissingContract: false,
                          });
                        }}
                      />
                    ) : (
                      <ScanResolutionPanel
                        conflict={routeScanConflict}
                        onDismiss={() => setRouteScanConflict(null)}
                        onSelect={(candidate) =>
                          void scanCard({
                            itemId: candidate.itemId,
                            confirmClosed: routeScanConflict.kind === "SOLO_CERRADAS",
                            confirmMissingContract:
                              routeScanConflict.kind === "SIN_CONTRATO_REQUIERE_CONFIRMACION",
                          })
                        }
                      />
                    )
                  ) : null}

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
                              onClick={async () => {
                                const reason = await requestReturnReason(item.card.returnReason);
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

          {operativoTab === "progreso" ? (
            <Panel title="Progreso de rutas" subtitle="Estado de acuses y devoluciones por ruta activa">
              <RouteProgressPanel
                routes={routes}
                formatDate={formatDate}
                onSelectRoute={setSelectedRouteForLot}
                emptyMessage="No hay rutas en progreso para la fecha."
              />
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
            </Panel>
          ) : null}
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
          </Panel>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

      {selectedRouteLot ? (
        <RouteLotModal
          route={selectedRouteLot}
          returnReasons={returnReasons}
          onClose={() => setSelectedRouteForLot(null)}
          onMark={markRouteItem}
          onRequireReturnReason={requestReturnReason}
        />
      ) : null}

      {selectedLotTracking ? (
        <TrackingLotModal
          lot={selectedLotTracking}
          returnReasons={returnReasons}
          onClose={() => setSelectedLotTrackingId(null)}
          onMark={markLotTrackingItem}
          onScanItem={scanLotTrackingCard}
          onRequireReturnReason={requestReturnReason}
        />
      ) : null}

      {showNewLot ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6" onClick={() => setShowNewLot(false)}>
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
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Pistolear o ingresar tarjetas del lote
                </label>
                <OperationalCardPicker
                  value={lotPickerValue}
                  onValueChange={setLotPickerValue}
                  onCardSelected={addSelectedLotCard}
                  onCardsSelected={addSelectedLotCards}
                  onMessage={setMessage}
                  placeholder="Pistolear TC/Cédula, escribir o pegar en lote..."
                  buttonLabel="Agregar"
                  inputLabel="Agregar tarjeta resuelta al lote"
                />
                <SelectedOperationalCardChips
                  cards={lotSelectedCards}
                  onRemove={(cardId) =>
                    setLotSelectedCards((previous) => previous.filter((card) => card.id !== cardId))
                  }
                  onClearAll={clearAllLotCards}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowNewLot(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={() => void createLot()}
                disabled={savingNewLot || !lotMessengerId || !lotDestinationProvince || (!lotSelectedCards.length && !lotPickerValue.trim())}
                className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingNewLot ? "Creando..." : `Crear lote ${lotSelectedCards.length ? `(${lotSelectedCards.length})` : ""}`}
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
  returnReasons,
  onClose,
  onMark,
  onRequireReturnReason,
}: {
  route: RouteRow;
  returnReasons: string[];
  onClose: () => void;
  onMark: (
    itemId: string,
    result: "EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA",
    comentario?: string,
    options?: { silent?: boolean; skipRefresh?: boolean },
  ) => Promise<void>;
  onRequireReturnReason: (existing?: string | null) => Promise<string | null>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<"EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA">("ACUSE_RECIBIDO");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState("");
  const allSelected = route.items.length > 0 && selectedIds.length === route.items.length;

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => route.items.some((item) => item.id === id)));
  }, [route.items]);

  function toggleItemSelection(itemId: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(itemId)) return prev;
        return [...prev, itemId];
      }
      return prev.filter((id) => id !== itemId);
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? route.items.map((item) => item.id) : []);
  }

  async function applyBulkStatus() {
    if (!selectedIds.length) {
      setBulkFeedback("Selecciona al menos una tarjeta.");
      return;
    }
    if (bulkStatus === "DEVUELTA_TIENDA" && !bulkReason.trim()) {
      setBulkFeedback("Selecciona o escribe el motivo de devolución.");
      return;
    }

    setBulkBusy(true);
    setBulkFeedback("");
    const motivo = bulkReason.trim();
    for (let index = 0; index < selectedIds.length; index += 1) {
      const itemId = selectedIds[index];
      const isLast = index === selectedIds.length - 1;
      await onMark(
        itemId,
        bulkStatus,
        bulkStatus === "DEVUELTA_TIENDA" ? motivo : undefined,
        { silent: true, skipRefresh: !isLast },
      );
    }
    setBulkBusy(false);
    setBulkFeedback(`Se actualizaron ${selectedIds.length} tarjetas.`);
    setSelectedIds([]);
  }

  return (
    <div className="fixed inset-0 z-[125] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6" onClick={onClose}>
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="font-display text-xs font-bold tracking-wide text-blue-700">RUTA {route.id.slice(-5).toUpperCase()}</p>
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

          <div className="mx-4 mb-3 rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                />
                Seleccionar todas ({selectedIds.length})
              </label>
              <select
                value={bulkStatus}
                onChange={(event) =>
                  setBulkStatus(event.target.value as "EN_RUTA" | "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA")
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="ACUSE_RECIBIDO">Acuse recibido</option>
                <option value="DEVUELTA_TIENDA">Devuelta a tienda</option>
                <option value="EN_RUTA">En ruta</option>
              </select>
              <button
                type="button"
                onClick={() => void applyBulkStatus()}
                disabled={bulkBusy || !selectedIds.length}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {bulkBusy ? "Aplicando..." : "Aplicar a seleccionadas"}
              </button>
            </div>
            {bulkStatus === "DEVUELTA_TIENDA" ? (
              <input
                value={bulkReason}
                onChange={(event) => setBulkReason(event.target.value)}
                list="route-return-reasons"
                placeholder="Motivo de devolución para seleccionadas"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            ) : null}
            {bulkFeedback ? <p className="mt-2 text-xs text-emerald-700">{bulkFeedback}</p> : null}
            <datalist id="route-return-reasons">
              {returnReasons.map((reason) => (
                <option key={reason} value={reason} />
              ))}
            </datalist>
          </div>

          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                  </th>
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
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={(event) => toggleItemSelection(item.id, event.target.checked)}
                      />
                    </td>
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
                        onChange={async (event) => {
                          if (!event.target.checked) {
                            void onMark(item.id, "EN_RUTA");
                            return;
                          }
                          const reason = await onRequireReturnReason(item.card.returnReason);
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
  returnReasons,
  onClose,
  onMark,
  onScanItem,
  onRequireReturnReason,
}: {
  lot: LotRow;
  returnReasons: string[];
  onClose: () => void;
  onMark: (
    itemId: string,
    result: "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA" | "EN_RUTA",
    comentario?: string,
    options?: { silent?: boolean; skipRefresh?: boolean },
  ) => Promise<void>;
  onScanItem: (
    lotId: string,
    identifier: string,
    selection?: { itemId: string; confirmClosed?: boolean },
  ) => Promise<ScanEndpointResult>;
  onRequireReturnReason: (existing?: string | null) => Promise<string | null>;
}) {
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState("");
  const [scanConflict, setScanConflict] = useState<ScanConflict | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<"ACUSE_RECIBIDO" | "DEVUELTA_TIENDA" | "EN_RUTA">("ACUSE_RECIBIDO");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState("");
  const allSelected = lot.items.length > 0 && selectedIds.length === lot.items.length;

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => lot.items.some((item) => item.id === id)));
  }, [lot.items]);

  function toggleItemSelection(itemId: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(itemId)) return prev;
        return [...prev, itemId];
      }
      return prev.filter((id) => id !== itemId);
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? lot.items.map((item) => item.id) : []);
  }

  async function applyBulkStatus() {
    if (!selectedIds.length) {
      setBulkFeedback("Selecciona al menos una tarjeta.");
      return;
    }
    if (bulkStatus === "DEVUELTA_TIENDA" && !bulkReason.trim()) {
      setBulkFeedback("Selecciona o escribe el motivo de devolución.");
      return;
    }

    setBulkBusy(true);
    setBulkFeedback("");
    const motivo = bulkReason.trim();
    for (let index = 0; index < selectedIds.length; index += 1) {
      const itemId = selectedIds[index];
      const isLast = index === selectedIds.length - 1;
      await onMark(
        itemId,
        bulkStatus,
        bulkStatus === "DEVUELTA_TIENDA" ? motivo : undefined,
        { silent: true, skipRefresh: !isLast },
      );
    }
    setBulkBusy(false);
    setBulkFeedback(`Se actualizaron ${selectedIds.length} tarjetas.`);
    setSelectedIds([]);
  }

  async function scanLotItem(selection?: { itemId: string; confirmClosed?: boolean }) {
    const value = scanInput.trim();
    if (!value) return;

    const response = await onScanItem(lot.id, value, selection);
    if (!response.success) {
      if (response.conflict) {
        setScanConflict(response.conflict);
        setScanResult("");
      } else {
        setScanConflict(null);
        setScanResult(response.error);
      }
      return;
    }

    setScanConflict(null);
    setScanResult(`Tarjeta ${response.scanned.tc} marcada como acuse recibido`);
    setScanInput("");
  }

  function onScanKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void scanLotItem();
  }

  return (
    <div className="fixed inset-0 z-[126] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6" onClick={onClose}>
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="font-display text-xs font-bold tracking-wide text-blue-700">LOTE {lot.lotNumber}</p>
            <h3 className="font-display text-xl font-bold text-slate-900">{lot.enviadoA}</h3>
            <p className="text-xs text-slate-500">{lot.sentTo ?? "-"} · {formatDate(lot.fechaEnvio)}</p>
          </div>
          <button onClick={onClose} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-4">
            <Stat label="Total" value={lot.stats.total} />
            <Stat label="Acuses" value={lot.stats.recibidas} />
            <Stat label="Devueltas" value={lot.stats.retornadas} />
            <Stat label="Pendientes" value={lot.stats.pendientes} />
          </div>

          <div className="mb-3 rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                />
                Seleccionar todas ({selectedIds.length})
              </label>
              <select
                value={bulkStatus}
                onChange={(event) =>
                  setBulkStatus(event.target.value as "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA" | "EN_RUTA")
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="ACUSE_RECIBIDO">Acuse recibido</option>
                <option value="DEVUELTA_TIENDA">Devuelta a tienda</option>
                <option value="EN_RUTA">En ruta</option>
              </select>
              <button
                type="button"
                onClick={() => void applyBulkStatus()}
                disabled={bulkBusy || !selectedIds.length}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {bulkBusy ? "Aplicando..." : "Aplicar a seleccionadas"}
              </button>
            </div>
            {bulkStatus === "DEVUELTA_TIENDA" ? (
              <input
                value={bulkReason}
                onChange={(event) => setBulkReason(event.target.value)}
                list="tracking-return-reasons"
                placeholder="Motivo de devolución para seleccionadas"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            ) : null}
            {bulkFeedback ? <p className="mt-2 text-xs text-emerald-700">{bulkFeedback}</p> : null}
            <datalist id="tracking-return-reasons">
              {returnReasons.map((reason) => (
                <option key={reason} value={reason} />
              ))}
            </datalist>
          </div>

          <div className="mb-3 rounded-xl border border-slate-200 p-3">
            <input
              value={scanInput}
              onChange={(event) => {
                setScanInput(event.target.value);
                setScanConflict(null);
              }}
              onKeyDown={onScanKeyDown}
              placeholder="Pistolear TC/Cedula y presionar Enter"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {scanConflict ? (
              <ScanResolutionPanel
                conflict={scanConflict}
                onDismiss={() => setScanConflict(null)}
                onSelect={(candidate) =>
                  void scanLotItem({
                    itemId: candidate.itemId,
                    confirmClosed: scanConflict.kind === "SOLO_CERRADAS",
                  })
                }
              />
            ) : null}
            {scanResult ? <p className="mt-2 text-xs text-emerald-700">{scanResult}</p> : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                  </th>
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
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(event) => toggleItemSelection(item.id, event.target.checked)}
                        />
                      </td>
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
                          onChange={async (event) => {
                            if (!event.target.checked) {
                              void onMark(item.id, "EN_RUTA");
                              return;
                            }
                            const reason = await onRequireReturnReason(item.card?.returnReason);
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
