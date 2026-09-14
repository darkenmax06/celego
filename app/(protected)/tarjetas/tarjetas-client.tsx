"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { CardExportWizardModal } from "@/components/cards/card-export-wizard-modal";
import { CardGroupAssignModal } from "@/components/cards/card-group-assign-modal";
import { CardSelectCheckbox } from "@/components/cards/card-select-checkbox";
import { CardSelectionBar, type SelectedCardEntry } from "@/components/cards/card-selection-bar";
import { dateRangeFilterBarProps } from "@/components/filters/date-range-filter";
import { FilterBar, groupByLevelLabel, ViewType } from "@/components/filters/filter-bar";
import { NestedGroupList, useCollapsedGroups, type GroupSelection } from "@/components/grouping/nested-group-list";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { notificationFailureMessage, notifyInBrowser } from "@/lib/browser-notifications";
import {
  CARD_DATE_FIELDS,
  CARD_DATE_GROUP_OPTIONS,
  cardDateFilterOptions,
  formatCardDate,
  getCardDateGroup,
  parseDateGroupToken,
} from "@/lib/card-date-fields";
import {
  dateRangeParamKeys,
  LEGACY_DATE_FIELD_PARAM,
  LEGACY_DATE_FROM_PARAM,
  LEGACY_DATE_TO_PARAM,
  normalizeDateRangeFilters,
} from "@/lib/date-range-params";
import { groupRowsNested, parseGroupByLevels } from "@/lib/grouping";
import { useCardGroups } from "@/lib/use-card-groups";
import { useCardSelection } from "@/lib/use-card-selection";
import { usePersistentState } from "@/lib/use-persistent-state";

type CardRow = {
  id: string;
  tc: string;
  requestNumber?: string | null;
  productType?: "CREDITO" | "DEBITO" | null;
  provincia: string;
  zona: string;
  isRemote: boolean;
  isAdditional: boolean;
  additionalIndex: number;
  status: string;
  urgent: boolean;
  dispatchOrigin: "TORRE_POPULAR" | "CENTRO_ACOPIO" | "BPD_DEBITO" | null;
  dispatchDate: string | null;
  slaDueDate?: string | null;
  reassignedAt?: string | null;
  bizcochitoAt?: string | null;
  contractImageAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  customer: { nombre: string; cedula: string };
  currentMessenger?: { nombre: string } | null;
  activeUrgentCase: {
    id: string;
    level: number;
    nextNotificationAt: string | null;
    lastNotifiedAt: string | null;
  } | null;
  contactado?: boolean;
  contactoEstado?: string;
  canalContacto?: string | null;
  solicitudRetorno?: boolean;
  motivoRetorno?: string | null;
  traslado?: Record<string, unknown> | null;
  nuevaDireccion?: string | null;
  fechaPreferenciaEntrega?: string | null;
  comentarioContacto?: string | null;
  metadata?: unknown;
};

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type CardsResponse = { cards: CardRow[]; pagination?: PaginationMeta };

type UrgencyPayload = {
  cardId: string;
  urgent: boolean;
  level?: number;
  resolve?: boolean;
  note?: string;
};

type UrgentNotification = {
  urgentCaseId: string;
  cardId: string;
  tc: string;
  cliente: string;
  cedula: string;
  provincia: string;
  level: number;
  label: string;
  intervalMinutes: number;
  nextNotificationAt: string;
};

type UrgencyMutationResponse = {
  urgent?: boolean;
  label?: string;
  notifyNow?: boolean;
  notification?: UrgentNotification | null;
  error?: string;
};

function urgencyClasses(level: number | null) {
  if (level === 5) return "border-red-600 bg-red-100 text-red-900";
  if (level === 4) return "border-rose-500 bg-rose-100 text-rose-900";
  if (level === 3) return "border-orange-500 bg-orange-100 text-orange-900";
  if (level === 2) return "border-amber-500 bg-amber-100 text-amber-900";
  if (level === 1) return "border-yellow-500 bg-yellow-100 text-yellow-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function urgencyLabel(level: number) {
  if (level === 5) return "Nivel 5";
  if (level === 4) return "Nivel 4";
  if (level === 3) return "Nivel 3";
  if (level === 2) return "Nivel 2";
  return "Nivel 1";
}

function formatUrgentClock(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO");
}

import { useMemo } from "react";
import { TableColumnSelector } from "@/components/ui/table-column-selector";
import {
  useResizableColumns,
  ResizableHeader,
} from "@/components/ui/use-resizable-columns";

const TARJETA_COLUMNS = [
  { key: "tc", label: "TC", locked: true },
  { key: "contactoEstado", label: "Gestión Contacto" },
  { key: "producto", label: "Producto" },
  { key: "cliente", label: "Cliente" },
  { key: "cedula", label: "Cédula" },
  { key: "provincia", label: "Provincia" },
  { key: "zona", label: "Zona" },
  { key: "remota", label: "Remota" },
  { key: "tipo", label: "Tipo" },
  { key: "origen", label: "Origen" },
  { key: "estado", label: "Estado" },
  { key: "urgente", label: "Urgente" },
  { key: "nivel", label: "Nivel" },
  { key: "proximaAlerta", label: "Próxima alerta" },
  ...CARD_DATE_FIELDS.map((field) => ({ key: field.key, label: field.label })),
] as const;

/** Date columns are opt-in: they start hidden until picked in the column selector. */
const DATE_COLUMN_KEYS = new Set<string>(CARD_DATE_FIELDS.map((field) => field.key));
const DEFAULT_VISIBLE_COLUMNS = TARJETA_COLUMNS.map((c) => c.key).filter((key) => !DATE_COLUMN_KEYS.has(key));

type TarjetaColumnKey = (typeof TARJETA_COLUMNS)[number]["key"];

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  tc: 150,
  contactoEstado: 160,
  producto: 110,
  cliente: 240,
  cedula: 130,
  provincia: 140,
  zona: 130,
  remota: 90,
  tipo: 120,
  origen: 150,
  estado: 140,
  urgente: 90,
  nivel: 100,
  proximaAlerta: 150,
  dispatchDate: 130,
  slaDueDate: 130,
  fechaPreferenciaEntrega: 150,
  reassignedAt: 160,
  bizcochitoAt: 160,
  contractImageAt: 160,
  createdAt: 160,
  updatedAt: 160,
  acciones: 130,
};

function getCardGroupKey(card: CardRow, groupBy: string): { key: string; label: string } {
  const dateGroup = parseDateGroupToken(groupBy);
  if (dateGroup) return getCardDateGroup(card, dateGroup.key, dateGroup.granularity);
  switch (groupBy) {
    case "contactoEstado": {
      if (card.contactoEstado === "RETORNO_SOLICITADO") return { key: "RETORNO_SOLICITADO", label: "⚠ Retorno Solicitado" };
      if (card.contactoEstado === "TRASLADO_SOLICITADO") return { key: "TRASLADO_SOLICITADO", label: "✈ Traslado Solicitado" };
      if (card.contactoEstado === "CONTACTADA") return { key: "CONTACTADA", label: "✓ Contactadas" };
      return { key: "NO_CONTACTADA", label: "○ No Contactadas / Pendientes" };
    }
    case "productType": {
      return {
        key: card.productType || "CREDITO",
        label: card.productType === "DEBITO" ? "Débito" : "Crédito",
      };
    }
    case "origin": {
      const origin = card.dispatchOrigin;
      if (origin === "TORRE_POPULAR") return { key: "TORRE_POPULAR", label: "Torre Popular" };
      if (origin === "CENTRO_ACOPIO") return { key: "CENTRO_ACOPIO", label: "Centro de Acopio" };
      if (origin === "BPD_DEBITO") return { key: "BPD_DEBITO", label: "BPD Débito" };
      return { key: "NONE", label: "Sin procedencia" };
    }
    case "status": {
      return { key: card.status || "SIN_ESTADO", label: card.status || "Sin Estado" };
    }
    case "provincia": {
      return { key: card.provincia || "SIN_PROVINCIA", label: card.provincia || "Sin Provincia" };
    }
    case "zona": {
      return { key: card.zona || "SIN_ZONA", label: card.zona || "Sin Zona" };
    }
    case "urgent": {
      return card.urgent
        ? { key: "URGENT", label: "Urgentes" }
        : { key: "NORMAL", label: "No Urgentes" };
    }
    case "remota":
    case "isRemote": {
      return card.isRemote
        ? { key: "REMOTA", label: "Remotas" }
        : { key: "LOCAL", label: "Locales (No remotas)" };
    }
    case "tipo":
    case "isAdditional": {
      return card.isAdditional
        ? { key: `ADICIONAL_${card.additionalIndex}`, label: `Adicional ${card.additionalIndex}` }
        : { key: "PRINCIPAL", label: "Principal" };
    }
    case "cliente":
    case "customer": {
      return { key: card.customer?.nombre || "SIN_CLIENTE", label: card.customer?.nombre || "Sin Cliente" };
    }
    case "cedula": {
      return { key: card.customer?.cedula || "SIN_CEDULA", label: card.customer?.cedula || "Sin Cédula" };
    }
    default: {
      const val = (card as unknown as Record<string, unknown>)[groupBy];
      if (val !== undefined && val !== null) {
        return { key: String(val), label: String(val) };
      }
      return { key: "ALL", label: "General" };
    }
  }
}

const TARJETA_DATE_FILTER_FIELDS = cardDateFilterOptions([
  "dispatchDate",
  "slaDueDate",
  "reassignedAt",
  "createdAt",
  "updatedAt",
]);

/**
 * Filter keys read from the URL on load. Date ranges use `date.<field>.from|to`;
 * the legacy `dateField`/`dateFrom`/`dateTo` form is still read and migrated.
 */
const URL_FILTER_KEYS = [
  "status",
  "zona",
  "provincia",
  "urgent",
  "from",
  "to",
  "origin",
  "remote",
  "productType",
  "contactoEstado",
  "grupo",
  ...dateRangeParamKeys(TARJETA_DATE_FILTER_FIELDS.map((field) => field.value)),
  LEGACY_DATE_FIELD_PARAM,
  LEGACY_DATE_FROM_PARAM,
  LEGACY_DATE_TO_PARAM,
];

const TARJETA_GROUP_BY_OPTIONS = [
  { field: "contactoEstado", label: "Gestión Contacto" },
  { field: "productType", label: "Producto" },
  { field: "origin", label: "Origen" },
  { field: "status", label: "Estado" },
  { field: "provincia", label: "Provincia" },
  { field: "zona", label: "Zona" },
  ...CARD_DATE_GROUP_OPTIONS,
];

type TarjetasClientProps = {
  /** SDD card-groups — Work Unit G, Task 22: gates selection/bulk UI to ADMIN/OPERADOR. */
  role: string;
};

export default function TarjetasClient({ role }: TarjetasClientProps) {
  const canManageGroups = role === "ADMIN" || role === "OPERADOR";
  const searchParams = useSearchParams();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = { page: "1", pageSize: "50" };
    for (const key of URL_FILTER_KEYS) {
      const value = searchParams.get(key);
      if (value) initial[key] = value;
    }
    return normalizeDateRangeFilters(initial);
  });
  const [viewMode, setViewMode] = useState<ViewType>("list");
  const [visibleColumns, setVisibleColumns] = usePersistentState<TarjetaColumnKey[]>(
    "tarjetas:visible-columns",
    DEFAULT_VISIBLE_COLUMNS,
  );
  const { widths: columnWidths, updateWidth: onColumnResize } = useResizableColumns(
    "tarjetas",
    DEFAULT_COLUMN_WIDTHS,
  );
  const collapsedGroups = useCollapsedGroups();
  const [loading, setLoading] = useState(false);
  const [notificationIssue, setNotificationIssue] = useState("");
  const [selectedCardId, setSelectedCardId] = usePersistentState<string | null>(
    "tarjetas:selected-card",
    null,
  );
  const [urgencyTarget, setUrgencyTarget] = useState<CardRow | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
  });

  // SDD card-groups — Work Unit G, Task 22.
  const cardSelection = useCardSelection();
  const cardGroups = useCardGroups();
  const groupSelection: GroupSelection<CardRow> | undefined = canManageGroups
    ? {
        getRowId: (card) => card.id,
        isSelected: cardSelection.isSelected,
        onChange: (ids, checked) => (checked ? cardSelection.selectMany(ids) : cardSelection.deselectMany(ids)),
      }
    : undefined;
  const [assignModalMode, setAssignModalMode] = useState<"existing" | "new" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [groupActionError, setGroupActionError] = useState<string | null>(null);
  // SDD card-groups remediation — FIX 2: the off-filter count can only be
  // answered by the database (the browser cannot know whether an unloaded
  // card matches the active filter), so it is fetched from
  // `POST /api/tarjetas/off-filter-count` when the confirmation opens rather
  // than derived from the loaded page. `null` means "still loading/unknown"
  // and is rendered as such — never as a fabricated 0.
  const [offFilterCount, setOffFilterCount] = useState<number | null>(null);
  const [offFilterError, setOffFilterError] = useState<string | null>(null);

  const activeGroupFilterIds = (filters.grupo ?? "").split(",").filter(Boolean);

  // SDD card-groups remediation — FIX 1: identity lookup for the selection
  // review panel, built ONLY from the loaded page. An id absent here means
  // the card is selected but outside the current page/filter, and the bar
  // renders it as a clearly-labelled minimal entry instead of dropping it.
  const cardsById = useMemo(() => {
    const map: Record<string, SelectedCardEntry> = {};
    for (const card of cards) {
      map[card.id] = { id: card.id, tc: card.tc, customerName: card.customer.nombre, cedula: card.customer.cedula };
    }
    return map;
  }, [cards]);

  useEffect(() => {
    if (!assignModalMode) return;
    let cancelled = false;
    setOffFilterCount(null);
    setOffFilterError(null);
    (async () => {
      try {
        const response = await fetch("/api/tarjetas/off-filter-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardIds: cardSelection.ids, filters }),
        });
        if (!response.ok) throw new Error("off-filter-count request failed");
        const body = (await response.json()) as { offFilterCount: number };
        if (!cancelled) setOffFilterCount(body.offFilterCount);
      } catch {
        if (!cancelled) {
          setOffFilterError(
            "No se pudo calcular cuántas tarjetas seleccionadas están fuera del filtro actual.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignModalMode]);

  async function afterGroupAction() {
    setAssignModalMode(null);
    cardSelection.clear();
    await cardGroups.reload();
    await fetchCards(filters);
  }

  async function handleRemoveFromGroup() {
    const [groupId] = activeGroupFilterIds.filter((id) => id !== "SIN_GRUPO");
    if (!groupId) return;
    setGroupActionError(null);
    const response = await fetch(`/api/card-groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeCardIds: cardSelection.ids }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setGroupActionError(body.error ?? "No se pudo quitar la selección del grupo");
      return;
    }
    await afterGroupAction();
  }

  async function fetchCards(currentFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(currentFilters).forEach(([k, v]) => {
      if (v && v !== "ALL") params.set(k, v);
    });

    const res = await fetch(`/api/tarjetas?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as CardsResponse;
    setCards(json.cards ?? []);
    if (json.pagination) {
      setPagination(json.pagination);
    }
    setLoading(false);
  }

  useEffect(() => {
    void fetchCards(filters);
  }, [filters]);

  const groupLevels = useMemo(() => parseGroupByLevels(filters.groupBy), [filters.groupBy]);
  // Date buckets read best chronologically; other levels keep first-seen order.
  const groupedCards = useMemo(() => groupRowsNested(cards, groupLevels, getCardGroupKey), [cards, groupLevels]);

  async function onSaveUrgency(payload: UrgencyPayload): Promise<string | null> {
    const res = await fetch("/api/operativo/urgencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as UrgencyMutationResponse;
    if (!res.ok) {
      return json.error ?? "No se pudo guardar la urgencia";
    }

    if (json.notifyNow && json.notification) {
      const result = await notifyInBrowser({
        title: `Urgencia activa: ${json.notification.label}`,
        body: `${json.notification.cliente} - TC ${json.notification.tc}. Primera notificacion enviada.`,
        tag: `urgent-now-${json.notification.urgentCaseId}`,
        requireInteraction: true,
      });
      const warning = notificationFailureMessage(result);
      if (warning) {
        setNotificationIssue(warning);
      } else {
        setNotificationIssue("");
      }
    }

    await fetchCards(filters);
    return null;
  }

  const renderCardRow = (card: CardRow) => (
    <tr key={card.id} className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors">
      {canManageGroups ? (
        <td className="px-3 py-2.5">
          <CardSelectCheckbox
            checked={cardSelection.isSelected(card.id)}
            onChange={() => cardSelection.toggle(card.id)}
            label={`Seleccionar tarjeta ${card.tc}`}
          />
        </td>
      ) : null}
      {visibleColumns.includes("tc") ? (
        <td
          className="cursor-pointer px-3 py-2.5 font-mono font-bold text-blue-700 hover:underline truncate"
          onClick={() => setSelectedCardId(card.id)}
          title={card.tc}
        >
          {card.tc}
        </td>
      ) : null}
      {visibleColumns.includes("contactoEstado") ? (
        <td className="px-3 py-2.5 truncate">
          {card.solicitudRetorno || card.contactoEstado === "RETORNO_SOLICITADO" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-bold text-rose-700">
              ⚠ Retorno
            </span>
          ) : card.traslado || card.contactoEstado === "TRASLADO_SOLICITADO" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700">
              ✈ Traslado
            </span>
          ) : card.contactado || card.contactoEstado === "CONTACTADA" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-700">
              ✓ Contactada {card.canalContacto ? `(${card.canalContacto})` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
              ○ No contactada
            </span>
          )}
        </td>
      ) : null}
      {visibleColumns.includes("producto") ? (
        <td className="px-3 py-2.5 truncate">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
              card.productType === "DEBITO"
                ? "bg-amber-100 text-amber-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {card.productType === "DEBITO" ? "Débito" : "Crédito"}
          </span>
        </td>
      ) : null}
      {visibleColumns.includes("cliente") ? (
        <td
          className="cursor-pointer px-3 py-2.5 font-medium text-slate-900 hover:underline truncate"
          onClick={() => setSelectedCardId(card.id)}
          title={card.customer.nombre}
        >
          {card.customer.nombre}
        </td>
      ) : null}
      {visibleColumns.includes("cedula") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={card.customer.cedula}>{card.customer.cedula}</td>
      ) : null}
      {visibleColumns.includes("provincia") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={card.provincia}>{card.provincia}</td>
      ) : null}
      {visibleColumns.includes("zona") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={card.zona}>{card.zona}</td>
      ) : null}
      {visibleColumns.includes("remota") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">{card.isRemote ? "SÍ" : "NO"}</td>
      ) : null}
      {visibleColumns.includes("tipo") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">
          <span className="truncate block">
            {card.isAdditional ? `ADIC. ${card.additionalIndex}` : "PRINCIPAL"}
          </span>
        </td>
      ) : null}
      {visibleColumns.includes("origen") ? (
        <td
          className="px-3 py-2.5 text-slate-600 truncate"
          title={
            card.dispatchOrigin === "CENTRO_ACOPIO"
              ? "Centro de acopio"
              : card.dispatchOrigin === "TORRE_POPULAR"
                ? "Torre Popular"
                : card.dispatchOrigin === "BPD_DEBITO"
                  ? "BPD Débito"
                  : "Sin procedencia"
          }
        >
          <span className="truncate block">
            {card.dispatchOrigin === "CENTRO_ACOPIO"
              ? "Centro de acopio"
              : card.dispatchOrigin === "TORRE_POPULAR"
                ? "Torre Popular"
                : card.dispatchOrigin === "BPD_DEBITO"
                  ? "BPD Débito"
                  : "Sin procedencia"}
          </span>
        </td>
      ) : null}
      {visibleColumns.includes("estado") ? (
        <td className="px-3 py-2.5 truncate">
          <StatusBadge value={card.status} />
        </td>
      ) : null}
      {visibleColumns.includes("urgente") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">{card.urgent ? "SÍ" : "NO"}</td>
      ) : null}
      {visibleColumns.includes("nivel") ? (
        <td className="px-3 py-2.5 truncate">
          {card.activeUrgentCase ? (
            <span
              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${urgencyClasses(card.activeUrgentCase.level)}`}
            >
              {urgencyLabel(card.activeUrgentCase.level)}
            </span>
          ) : (
            "-"
          )}
        </td>
      ) : null}
      {visibleColumns.includes("proximaAlerta") ? (
        <td className="px-3 py-2.5 text-xs text-slate-600 truncate">
          {formatUrgentClock(card.activeUrgentCase?.nextNotificationAt ?? null)}
        </td>
      ) : null}
      {CARD_DATE_FIELDS.map((field) =>
        visibleColumns.includes(field.key) ? (
          <td key={field.key} className="px-3 py-2.5 text-xs text-slate-600 truncate">
            {formatCardDate(card, field.key)}
          </td>
        ) : null,
      )}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setUrgencyTarget(card)}
            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            Urgencia
          </button>
          <button
            type="button"
            onClick={() => setSelectedCardId(card.id)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ver
          </button>
        </div>
      </td>
    </tr>
  );

  // SDD card-groups — Work Unit G, Task 22. Moved out of an inline literal:
  // `filter-bar.tsx:149` depends on `facets` for its effect, so the ORIGINAL
  // inline array already re-ran that effect on every render — this is
  // required, not hygiene, once `groups` is a real dependency.
  const tarjetaFacets = useMemo(
    () => [
      {
        field: "contactoEstado",
        label: "Gestión Contacto",
        options: [
          { label: "Contactadas", value: "CONTACTADA" },
          { label: "No contactadas / Pendientes", value: "NO_CONTACTADA" },
          { label: "Retorno solicitado", value: "RETORNO_SOLICITADO" },
          { label: "Traslado solicitado", value: "TRASLADO_SOLICITADO" },
        ],
      },
      {
        field: "productType",
        label: "Producto",
        options: [
          { label: "Crédito", value: "CREDITO" },
          { label: "Débito", value: "DEBITO" },
        ],
      },
      { field: "status", label: "Estado", multi: true },
      { field: "provincia", label: "Provincia", multi: true },
      { field: "zona", label: "Zona", multi: true },
      {
        field: "grupo",
        label: "Grupo",
        multi: true,
        options: [
          ...cardGroups.groups.map((group) => ({ label: group.name, value: group.id })),
          { label: "Sin grupo", value: "SIN_GRUPO" },
        ],
      },
      {
        field: "origin",
        label: "Origen",
        options: [
          { label: "Torre Popular", value: "TORRE_POPULAR" },
          { label: "Centro de Acopio", value: "CENTRO_ACOPIO" },
          { label: "BPD Débito", value: "BPD_DEBITO" },
        ],
      },
      {
        field: "urgent",
        label: "Urgente",
        options: [{ label: "Solo urgentes", value: "1" }],
      },
    ],
    [cardGroups.groups],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Tarjetas" subtitle="Consulta y clasificacion de tarjetas" />

      {/* FilterBar Odoo Style */}
      <FilterBar
        resource="tarjetas"
        sectionKey="tarjetas"
        filters={filters}
        onFilterChange={(next) =>
          setFilters({ ...normalizeDateRangeFilters(next), page: "1", pageSize: filters.pageSize || "50" })
        }
        onReset={() => setFilters({ page: "1", pageSize: "50" })}
        searchPlaceholder="Buscar por TC, cédula, nombre o referencia..."
        allowedViews={["list", "cards"]}
        currentView={viewMode}
        onViewChange={setViewMode}
        facets={tarjetaFacets}
        groupByOptions={TARJETA_GROUP_BY_OPTIONS}
        {...dateRangeFilterBarProps({
          fields: TARJETA_DATE_FILTER_FIELDS,
          filters,
          onChange: (next) => setFilters({ ...next, page: "1" }),
        })}
      />

      {notificationIssue ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {notificationIssue}
        </div>
      ) : null}

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {loading ? "Cargando..." : `Listado de tarjetas (${pagination.total})`}
            </h2>
            {groupLevels.length ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Agrupado por:{" "}
                {groupLevels.map((token) => groupByLevelLabel(token, TARJETA_GROUP_BY_OPTIONS)).join(" › ")}
              </span>
            ) : null}
          </div>
          {viewMode === "list" ? (
            <TableColumnSelector
              columns={TARJETA_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
            />
          ) : null}
        </div>

        {viewMode === "cards" ? (
          /* Cards View (Grouped or Flat) */
          groupedCards ? (
            <div className="space-y-6">
              <NestedGroupList
                groups={groupedCards}
                variant="blocks"
                isCollapsed={collapsedGroups.isCollapsed}
                onToggle={collapsedGroups.toggle}
                selection={groupSelection}
                countLabel={(count) => `${count} ${count === 1 ? "tarjeta" : "tarjetas"}`}
                renderRows={(rows) => (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {rows.map((card) => (
                      <div
                        key={card.id}
                        className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-slate-300"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              {canManageGroups ? (
                                <CardSelectCheckbox
                                  checked={cardSelection.isSelected(card.id)}
                                  onChange={() => cardSelection.toggle(card.id)}
                                  label={`Seleccionar tarjeta ${card.tc}`}
                                />
                              ) : null}
                              <span className="font-mono text-sm font-bold text-blue-700">{card.tc}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {card.solicitudRetorno || card.contactoEstado === "RETORNO_SOLICITADO" ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                  ⚠ Retorno
                                </span>
                              ) : card.traslado || card.contactoEstado === "TRASLADO_SOLICITADO" ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                  ✈ Traslado
                                </span>
                              ) : card.contactado || card.contactoEstado === "CONTACTADA" ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                  ✓ Contactada
                                </span>
                              ) : null}
                              <StatusBadge value={card.status} />
                            </div>
                          </div>
                          <h4 className="mt-2 font-semibold text-slate-900">{card.customer.nombre}</h4>
                          <p className="text-xs text-slate-500">Cédula: {card.customer.cedula}</p>
                          <p className="mt-2 text-xs text-slate-600">
                            {card.provincia} • {card.zona} {card.isRemote ? "(Remota)" : ""}
                          </p>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="text-xs text-slate-400">
                            {card.isAdditional ? `Adic. ${card.additionalIndex}` : "Principal"}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setUrgencyTarget(card)}
                              className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Urgencia
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedCardId(card.id)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Ver
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              />
              {!groupedCards.length && !loading ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No hay tarjetas que coincidan con estos filtros.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-slate-300"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {canManageGroups ? (
                          <CardSelectCheckbox
                            checked={cardSelection.isSelected(card.id)}
                            onChange={() => cardSelection.toggle(card.id)}
                            label={`Seleccionar tarjeta ${card.tc}`}
                          />
                        ) : null}
                        <span className="font-mono text-sm font-bold text-blue-700">{card.tc}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {card.solicitudRetorno || card.contactoEstado === "RETORNO_SOLICITADO" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            ⚠ Retorno
                          </span>
                        ) : card.traslado || card.contactoEstado === "TRASLADO_SOLICITADO" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                            ✈ Traslado
                          </span>
                        ) : card.contactado || card.contactoEstado === "CONTACTADA" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            ✓ Contactada
                          </span>
                        ) : null}
                        <StatusBadge value={card.status} />
                      </div>
                    </div>
                    <h4 className="mt-2 font-semibold text-slate-900">{card.customer.nombre}</h4>
                    <p className="text-xs text-slate-500">Cédula: {card.customer.cedula}</p>
                    <p className="mt-2 text-xs text-slate-600">
                      {card.provincia} • {card.zona} {card.isRemote ? "(Remota)" : ""}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-400">
                      {card.isAdditional ? `Adic. ${card.additionalIndex}` : "Principal"}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setUrgencyTarget(card)}
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Urgencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCardId(card.id)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Ver
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!cards.length && !loading ? (
                <p className="col-span-full py-8 text-center text-sm text-slate-500">
                  No hay tarjetas que coincidan con estos filtros.
                </p>
              ) : null}
            </div>
          )
        ) : (
          /* Table View with Horizontal Scroll & Resizable Headers */
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1100px] text-left text-sm table-fixed">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600 border-b border-slate-200">
                <tr>
                  {canManageGroups ? (
                    <th className="w-10 px-3">
                      <CardSelectCheckbox
                        checked={cards.length > 0 && cards.every((c) => cardSelection.isSelected(c.id))}
                        onChange={(checked) => {
                          if (checked) {
                            cardSelection.selectMany(cards.map((c) => c.id));
                          } else {
                            for (const c of cards) {
                              if (cardSelection.isSelected(c.id)) cardSelection.toggle(c.id);
                            }
                          }
                        }}
                        label="Seleccionar todas en esta página"
                      />
                    </th>
                  ) : null}
                  {visibleColumns.includes("tc") ? (
                    <ResizableHeader
                      columnKey="tc"
                      label="TC"
                      width={columnWidths.tc}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("contactoEstado") ? (
                    <ResizableHeader
                      columnKey="contactoEstado"
                      label="Gestión Contacto"
                      width={columnWidths.contactoEstado}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("producto") ? (
                    <ResizableHeader
                      columnKey="producto"
                      label="Producto"
                      width={columnWidths.producto}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("cliente") ? (
                    <ResizableHeader
                      columnKey="cliente"
                      label="Cliente"
                      width={columnWidths.cliente}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("cedula") ? (
                    <ResizableHeader
                      columnKey="cedula"
                      label="Cédula"
                      width={columnWidths.cedula}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("provincia") ? (
                    <ResizableHeader
                      columnKey="provincia"
                      label="Provincia"
                      width={columnWidths.provincia}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("zona") ? (
                    <ResizableHeader
                      columnKey="zona"
                      label="Zona"
                      width={columnWidths.zona}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("remota") ? (
                    <ResizableHeader
                      columnKey="remota"
                      label="Remota"
                      width={columnWidths.remota}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("tipo") ? (
                    <ResizableHeader
                      columnKey="tipo"
                      label="Tipo"
                      width={columnWidths.tipo}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("origen") ? (
                    <ResizableHeader
                      columnKey="origen"
                      label="Origen"
                      width={columnWidths.origen}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("estado") ? (
                    <ResizableHeader
                      columnKey="estado"
                      label="Estado"
                      width={columnWidths.estado}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("urgente") ? (
                    <ResizableHeader
                      columnKey="urgente"
                      label="Urgente"
                      width={columnWidths.urgente}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("nivel") ? (
                    <ResizableHeader
                      columnKey="nivel"
                      label="Nivel"
                      width={columnWidths.nivel}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {visibleColumns.includes("proximaAlerta") ? (
                    <ResizableHeader
                      columnKey="proximaAlerta"
                      label="Próxima alerta"
                      width={columnWidths.proximaAlerta}
                      onResize={onColumnResize}
                      className="px-3"
                    />
                  ) : null}
                  {CARD_DATE_FIELDS.map((field) =>
                    visibleColumns.includes(field.key) ? (
                      <ResizableHeader
                        key={field.key}
                        columnKey={field.key}
                        label={field.label}
                        width={columnWidths[field.key]}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null,
                  )}
                  <th
                    style={{ width: `${columnWidths.acciones}px` }}
                    className="px-3 pb-2.5 pt-1 text-right text-xs uppercase text-slate-500 font-semibold"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedCards ? (
                  /* Odoo Grouped Accordion Rows */
                  <NestedGroupList
                    groups={groupedCards}
                    variant="table"
                    colSpan={visibleColumns.length + (canManageGroups ? 2 : 1)}
                    isCollapsed={collapsedGroups.isCollapsed}
                    onToggle={collapsedGroups.toggle}
                    selection={groupSelection}
                    countLabel={(count) => `${count} ${count === 1 ? "tarjeta" : "tarjetas"}`}
                    renderRows={(rows) => rows.map((card) => renderCardRow(card))}
                  />
                ) : (
                  /* Standard Flat Rows */
                  cards.map((card) => renderCardRow(card))
                )}
                {!cards.length ? (
                  <tr>
                    <td colSpan={visibleColumns.length + (canManageGroups ? 2 : 1)} className="py-8 text-center text-sm text-slate-500">
                      {loading ? "Cargando..." : "No hay tarjetas que coincidan con estos filtros."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 || pagination.total > 10 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>
                Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> ({pagination.total} total)
              </span>
              <span className="text-slate-300">|</span>
              <label className="flex items-center gap-1">
                <span>Por página:</span>
                <select
                  value={filters.pageSize || "50"}
                  onChange={(e) => setFilters((prev) => ({ ...prev, pageSize: e.target.value, page: "1" }))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="400">400</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.max(1, pagination.page - 1)) }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setFilters((prev) => ({ ...prev, page: String(pagination.page + 1) }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      {canManageGroups ? (
        <CardSelectionBar
          count={cardSelection.count}
          selectedIds={cardSelection.ids}
          cardsById={cardsById}
          activeGroupFilterIds={activeGroupFilterIds}
          onClear={cardSelection.clear}
          onDeselect={cardSelection.toggle}
          onCreateGroup={() => setAssignModalMode("new")}
          onAssignExisting={() => setAssignModalMode("existing")}
          onRemoveFromGroup={() => void handleRemoveFromGroup()}
          onExport={() => setExportOpen(true)}
        />
      ) : null}
      {exportMessage ? (
        <p className="text-xs font-semibold text-emerald-700">{exportMessage}</p>
      ) : null}
      {canManageGroups && exportOpen ? (
        <CardExportWizardModal
          cardIds={cardSelection.ids}
          onClose={() => setExportOpen(false)}
          onExported={setExportMessage}
        />
      ) : null}
      {groupActionError ? (
        <p className="text-xs font-semibold text-red-600">{groupActionError}</p>
      ) : null}

      {canManageGroups && assignModalMode ? (
        <CardGroupAssignModal
          cardIds={cardSelection.ids}
          offFilterCount={offFilterCount}
          offFilterError={offFilterError}
          groups={cardGroups.groups}
          initialMode={assignModalMode}
          onClose={() => setAssignModalMode(null)}
          onSuccess={() => void afterGroupAction()}
        />
      ) : null}

      {selectedCardId ? (
        <CardDetailModal
          cardId={selectedCardId}
          onClose={() => setSelectedCardId(null)}
          onUpdated={() => {
            void fetchCards(filters);
          }}
        />
      ) : null}
      {urgencyTarget ? (
        <UrgencyModal
          card={urgencyTarget}
          onClose={() => setUrgencyTarget(null)}
          onSave={onSaveUrgency}
        />
      ) : null}
    </div>
  );
}

function UrgencyModal({
  card,
  onClose,
  onSave,
}: {
  card: CardRow;
  onClose: () => void;
  onSave: (payload: UrgencyPayload) => Promise<string | null>;
}) {
  const [enabled, setEnabled] = useState(card.urgent);
  const [level, setLevel] = useState(card.activeUrgentCase?.level ?? 1);
  const [urgencyComment, setUrgencyComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const save = async () => {
    setSaving(true);
    setFeedback("");
    const err = await onSave({
      cardId: card.id,
      urgent: enabled,
      level,
      note: urgencyComment.trim() || undefined,
    });
    setSaving(false);
    if (err) {
      setFeedback(err);
      return;
    }
    onClose();
  };

  const resolve = async () => {
    setSaving(true);
    setFeedback("");
    const err = await onSave({
      cardId: card.id,
      urgent: false,
      resolve: true,
      note: urgencyComment.trim() || undefined,
    });
    setSaving(false);
    if (err) {
      setFeedback(err);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-rose-700">Gestion de urgencia</p>
            <h3 className="text-lg font-bold text-slate-900">
              {card.customer.nombre} - {card.tc}
            </h3>
            <p className="text-xs text-slate-500">{card.customer.cedula}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-3">
          <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Marcar tarjeta como urgente
          </label>

          {enabled ? (
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nivel de urgencia
              <select
                value={level}
                onChange={(event) => setLevel(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-700"
              >
                <option value={1}>Nivel 1 (Leve) - cada 4.5 horas</option>
                <option value={2}>Nivel 2 (Moderada) - cada 3.5 horas</option>
                <option value={3}>Nivel 3 (Alta) - cada 2.5 horas</option>
                <option value={4}>Nivel 4 (Muy urgente) - cada 1.5 horas</option>
                <option value={5}>Nivel 5 (Extremadamente urgente) - cada 30 min</option>
              </select>
            </label>
          ) : null}

          <div className="mt-3 text-xs text-slate-600">
            <p>Ultima alerta: {formatUrgentClock(card.activeUrgentCase?.lastNotifiedAt ?? null)}</p>
            <p>Proxima alerta: {formatUrgentClock(card.activeUrgentCase?.nextNotificationAt ?? null)}</p>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comentario de urgencia
            </label>
            <textarea
              value={urgencyComment}
              onChange={(event) => setUrgencyComment(event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Ej: confirmar entrega hoy, cliente requiere prioridad..."
            />
          </div>
        </div>

        {feedback ? <p className="mt-3 text-sm text-rose-700">{feedback}</p> : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {card.urgent ? (
            <button
              type="button"
              onClick={() => void resolve()}
              disabled={saving}
              className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
            >
              Marcar como resuelto
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar urgencia"}
          </button>
        </div>
      </div>
    </div>
  );
}
