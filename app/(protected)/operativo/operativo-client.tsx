"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useCardListFilters } from "@/lib/use-card-list-filters";
import {
  CARD_GROUP_BY_FIELD,
  bucketCountLabel,
  cardGroupBuckets,
  groupRowsNested,
  parseGroupByLevels,
  toGroupNameMap,
} from "@/lib/grouping";
import { useCardGroups } from "@/lib/use-card-groups";
import { useCardSelection } from "@/lib/use-card-selection";
import {
  CardGroupAssignModal,
  OFF_FILTER_COUNT_UNAVAILABLE,
} from "@/components/cards/card-group-assign-modal";
import { CardGroupFanoutNote } from "@/components/cards/card-group-fanout-note";
import { CardSelectionBar, type SelectedCardEntry } from "@/components/cards/card-selection-bar";
import { type OperativeWizardCard } from "@/components/operativo/operative-contact-wizard";
import { SLAExtensionRequestsTable } from "@/components/operativo/sla-extension-requests-table";
import { CardFilterBar } from "@/components/filters/card-filter-bar";
import { AssignedToMeChip } from "@/components/filters/assigned-to-me-chip";
import { ContactReportModal } from "@/components/llamadas/contact-report-modal";
import { CallAssignModal } from "@/components/llamadas/call-assign-modal";
import type { FacetConfig, ViewType } from "@/components/filters/filter-bar";
import { NestedGroupList, useCollapsedGroups, type GroupSelection } from "@/components/grouping/nested-group-list";
import { dateRangeFilterBarProps } from "@/components/filters/date-range-filter";
import {
  cardDateFilterOptions,
  cardDateGroupOptions,
  getCardDateGroup,
  parseDateGroupToken,
} from "@/lib/card-date-fields";
import { normalizeDateRangeFilters } from "@/lib/date-range-params";
import { CardTile } from "@/components/cards/card-tile";
import { CardTileGrid } from "@/components/cards/card-tile-grid";
import { CardListTable } from "@/components/cards/card-list-table";
import { callItemFromOperativoRow, callItemGroupKey, type CallListItem } from "@/lib/llamadas/call-list-item";
import { callDetailHref, writeNavContext } from "@/lib/llamadas/nav-context";
import { UserMinus, UserPlus } from "lucide-react";
import {
  buildCallTabsSection,
  DEFAULT_OPERATIVE_TAB,
  type OperativeTab,
} from "@/components/operativo/call-tabs-section";
import { CallTabsDropdown } from "@/components/operativo/call-tabs-dropdown";

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
/** Operativo API row (`lib/operativo-row.ts`): the wizard card plus the calls-overhaul list fields. */
type OperativoRow = OperativeWizardCard & {
  asignadoA?: { id: string; name: string } | null;
  attempts?: number | null;
};
type OperativoResponse = { cards: OperativoRow[]; pagination?: PaginationMeta };
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

const OPERATIVO_ENDPOINT = "/api/operativo/contacto";
const DEFAULT_FILTERS = { page: "1", pageSize: "50", days: "3" };

/**
 * Page sizes offered by the paginator.
 *
 * Capped at 100 because `lib/list-query/descriptors/operativo-contacto.ts`
 * declares `maxPageSize: 100` and `compile()` clamps anything larger WITHOUT
 * telling the caller. Offering 200 would show the operator "200 per page"
 * while the server quietly returned 100.
 */
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const OPERATIVO_VIEWS: ViewType[] = ["cards", "list"];

const OPERATIVO_DATE_FILTER_FIELDS = cardDateFilterOptions([
  "dispatchDate",
  "slaDueDate",
  "reassignedAt",
  "createdAt",
  "updatedAt",
]);

const OPERATIVO_GROUP_BY_OPTIONS = [
  { field: "contactoEstado", label: "Gestión contacto" },
  { field: "asignado", label: "Asignado a" },
  { field: "provincia", label: "Provincia" },
  { field: "zona", label: "Zona" },
  { field: "status", label: "Estado" },
  { field: "canalContacto", label: "Canal de Contacto" },
  { field: "mensajero", label: "Mensajero" },
  { field: "gestion", label: "Estado de Gestión" },
  { field: CARD_GROUP_BY_FIELD, label: "Grupo" },
  ...cardDateGroupOptions(["dispatchDate", "slaDueDate", "fechaPreferenciaEntrega"]),
];

/** Page-specific facet (not in the shared catalog): only the activos tab filters by SLA horizon. */
const DAYS_FACET: FacetConfig = {
  field: "days",
  label: "Días SLA",
  options: [
    { label: "SLA <= 1 día", value: "1" },
    { label: "SLA <= 2 días", value: "2" },
    { label: "SLA <= 3 días", value: "3" },
    { label: "SLA <= 5 días", value: "5" },
  ],
};

function formatUrgentClock(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO");
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getOperativeGroupKey(card: OperativoRow, groupBy: string): { key: string; label: string } {
  const dateGroup = parseDateGroupToken(groupBy);
  if (dateGroup) {
    const source = {
      dispatchDate: card.fechaDespacho,
      slaDueDate: card.slaDueDate,
      fechaPreferenciaEntrega: card.fechaPreferenciaEntrega,
    };
    return getCardDateGroup(source, dateGroup.key, dateGroup.granularity);
  }
  switch (groupBy) {
    case "contactoEstado":
    case "asignado":
      return callItemGroupKey(callItemFromOperativoRow(card), groupBy);
    case "provincia":
      return { key: card.provincia || "SIN_PROVINCIA", label: card.provincia || "Sin Provincia" };
    case "zona":
      return { key: card.zona || "SIN_ZONA", label: card.zona || "Sin Zona" };
    case "status":
      return { key: card.status || "SIN_ESTADO", label: statusLabel(card.status || "Sin Estado") };
    case "canalContacto":
      return {
        key: card.canalContacto || "NO_ESPECIFICADO",
        label:
          card.canalContacto === "WHATSAPP"
            ? "WhatsApp"
            : card.canalContacto === "LLAMADA_DIRECTA"
              ? "Llamada Directa"
              : "Sin Canal Específico",
      };
    case "mensajero":
      return { key: card.mensajero || "SIN_ASIGNAR", label: card.mensajero || "Sin Asignar" };
    case "urgent":
      return card.urgent ? { key: "URGENTE", label: "Casos Urgentes" } : { key: "NORMAL", label: "Normales" };
    case "gestion":
      if (card.solicitudRetorno) return { key: "RETORNO", label: "Solicitud de Retorno" };
      if (card.traslado && Object.keys(card.traslado).length > 0) return { key: "TRASLADO", label: "Traslado / Cambio de Provincia" };
      if (card.contactado) return { key: "CONTACTADA", label: "Contactada Exitosamente" };
      if (card.hasAttempt) return { key: "NO_CONTACTADA", label: "No Contactada (Intentos)" };
      return { key: "PENDIENTE", label: "Por Llamar (Sin Gestión)" };
    default: {
      const val = (card as unknown as Record<string, unknown>)[groupBy];
      if (val !== undefined && val !== null) {
        return { key: String(val), label: String(val) };
      }
      return { key: "ALL", label: "General" };
    }
  }
}

/** Query params of the operativo list for a tab + filters, WITHOUT `page` / `pageSize`. */
function buildListParams(tab: OperativeTab, filters: Record<string, string>) {
  const params: Record<string, string> = { tab };
  if (filters.days) params.days = filters.days;
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== "ALL" && k !== "page" && k !== "pageSize" && k !== "days" && k !== "groupBy") {
      params[k] = v;
    }
  });
  return params;
}

type OperativoClientProps = {
  /** Stage B, Task B2: gates the selection checkboxes and bulk bar to ADMIN/OPERADOR. */
  role: string;
};

export default function OperativoClient({ role }: OperativoClientProps) {
  const canManageGroups = role === "ADMIN" || role === "OPERADOR";
  const router = useRouter();
  const pathname = usePathname();
  const [cards, setCards] = useState<OperativoRow[]>([]);
  const [tab, setTab] = usePersistentState<OperativeTab>("operativo:tab", "activos");
  const { filters, setFilters, resetFilters } = useCardListFilters({ defaults: DEFAULT_FILTERS });
  const cardGroups = useCardGroups();
  // The page already owns the card groups (it reloads them after a group
  // action), so the filter bar reuses them instead of fetching its own copy.
  const facetSources = useMemo(() => ({ groups: cardGroups.groups }), [cardGroups.groups]);
  const collapsedGroups = useCollapsedGroups();
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewType>("cards");
  const [showReport, setShowReport] = usePersistentState("operativo:report-modal", false);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
  });
  const [message, setMessage] = useState("");
  const [urgentNotifications, setUrgentNotifications] = useState<UrgentNotification[]>([]);

  // Stage B, Task B2: app-wide card selection and bulk group actions.
  const cardSelection = useCardSelection();
  const [assignModalMode, setAssignModalMode] = useState<"existing" | "new" | null>(null);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);
  // Target ids are frozen when the modal opens: the selection can change underneath it.
  const [callAssign, setCallAssign] = useState<{ mode: "assign" | "unassign"; cardIds: string[] } | null>(null);

  const activeGroupFilterIds = (filters.grupo ?? "").split(",").filter(Boolean);

  /**
   * Identity lookup for the selection review panel, built only from what this
   * screen loaded. Keyed by `cardId` (the database id the group endpoints
   * write), NOT by `card.id` - the `urgentes` tab synthesizes `urgent-<id>`
   * rows whose `cardId` is null and which are therefore never selectable.
   */
  const cardsById = useMemo(() => {
    const map: Record<string, SelectedCardEntry> = {};
    for (const card of cards) {
      if (!card.cardId) continue;
      map[card.cardId] = {
        id: card.cardId,
        tc: card.tc,
        customerName: card.nombre,
        cedula: card.cedula,
      };
    }
    return map;
  }, [cards]);

  async function pullUrgentNotifications() {
    const res = await fetch("/api/operativo/urgencias", { cache: "no-store" });
    const json = await res.json().catch(() => ({ notifications: [] }));
    if (!res.ok) return;
    const notifications = (json.notifications ?? []) as UrgentNotification[];
    if (!notifications.length) return;
    setUrgentNotifications(notifications);
  }

  async function loadCards(currentFilters = filters) {
    if (tab === "extensiones-sla") {
      setLoading(false);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams(buildListParams(tab, currentFilters));
    params.set("page", currentFilters.page || "1");
    params.set("pageSize", currentFilters.pageSize || "50");

    const res = await fetch(`${OPERATIVO_ENDPOINT}?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as OperativoResponse;
    setCards(json.cards ?? []);
    if (json.pagination) {
      setPagination(json.pagination);
    }
    setLoading(false);
  }

  // Changing tab restarts pagination, but NOT on mount: the page may come from the URL.
  const tabMountedRef = useRef(false);
  useEffect(() => {
    if (!tabMountedRef.current) {
      tabMountedRef.current = true;
      return;
    }
    setFilters((prev) => ({ ...prev, page: "1" }));
  }, [tab, setFilters]);

  useEffect(() => {
    void loadCards(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await pullUrgentNotifications();
    };
    void run();
    const timer = setInterval(() => {
      void run();
    }, 60_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const items = useMemo(() => cards.map(callItemFromOperativoRow), [cards]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const groupLevels = useMemo(() => parseGroupByLevels(filters.groupBy), [filters.groupBy]);
  const groupNameById = useMemo(() => toGroupNameMap(cardGroups.groups), [cardGroups.groups]);

  /** "Grupo" is the only level where a row lands in several buckets (fan-out). */
  const isGroupByGrupo = groupLevels.includes(CARD_GROUP_BY_FIELD);

  /**
   * No server totals here on purpose: `app/api/operativo/contacto/route.ts`
   * hand-builds its `where` across three tab branches and filters rows in
   * memory, so no honest per-group total exists for this screen. The bucket
   * headers therefore state only what this page shows, and the note says so.
   */
  const groupedCards = useMemo(
    () =>
      groupRowsNested(cards, groupLevels, (card: OperativoRow, token) =>
        token === CARD_GROUP_BY_FIELD ? cardGroupBuckets(card.groupIds, groupNameById) : getOperativeGroupKey(card, token),
      ),
    [cards, groupLevels, groupNameById],
  );

  const groupSelection: GroupSelection<OperativoRow> | undefined = canManageGroups
    ? {
        // Group headers select database card ids; synthesized urgent rows (no `cardId`) are skipped.
        getRowId: (card) => card.cardId ?? "",
        isSelected: cardSelection.isSelected,
        onChange: (ids, checked) => {
          const cardIds = ids.filter(Boolean);
          if (checked) cardSelection.selectMany(cardIds);
          else cardSelection.deselectMany(cardIds);
        },
      }
    : undefined;

  /** Stores the visible order (for prev/next on the detail screen) and opens it. */
  const openCallDetail = useCallback(
    (cardId: string, options: { llamar?: boolean } = {}) => {
      // Grouping by "Grupo" fans a card out into several buckets; keep its first position only.
      const visible = groupedCards ? groupedCards.flatMap((group) => group.rows) : cards;
      const page = Number(filters.page) || 1;
      writeNavContext({
        ids: [...new Set(visible.map((card) => card.cardId).filter((id): id is string => Boolean(id)))],
        originUrl: `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`,
        originLabel: "Operativo",
        source: {
          endpoint: OPERATIVO_ENDPOINT,
          params: buildListParams(tab, filters),
          listKey: "cards",
          idKey: "cardId",
          pageSize: pagination.pageSize,
          total: pagination.total,
          totalPages: pagination.totalPages,
          firstPage: page,
          lastPage: page,
        },
      });
      router.push(callDetailHref(cardId, options));
    },
    [groupedCards, cards, filters, pathname, tab, pagination, router],
  );

  const extraFacets = useMemo(() => (tab === "activos" ? [DAYS_FACET] : []), [tab]);

  async function afterGroupAction() {
    setAssignModalMode(null);
    cardSelection.clear();
    await cardGroups.reload();
    await loadCards(filters);
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

  async function exportDailyZip(date: string) {
    const res = await fetch(`/api/operativo/contacto/reportes?date=${date}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Error en descarga diaria" }));
      setMessage(json.error ?? "No se pudo generar el ZIP operativo");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operativo-${date}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`ZIP operativo generado para ${date}`);
  }

  const renderTile = (item: CallListItem) => (
    <CardTile
      data={item}
      onOpen={item.cardId ? () => openCallDetail(item.cardId as string) : undefined}
      footerLeft={item.cardId ? undefined : "Caso urgente sin tarjeta vinculada"}
      selection={
        canManageGroups && item.cardId
          ? {
              checked: cardSelection.isSelected(item.cardId),
              onToggle: () => cardSelection.toggle(item.cardId as string),
            }
          : undefined
      }
      actions={
        item.cardId ? (
          <button
            type="button"
            onClick={() => openCallDetail(item.cardId as string, { llamar: true })}
            className="rounded-lg bg-[#0f2544] px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800"
          >
            Llamar
          </button>
        ) : null
      }
    />
  );

  const renderTileGrid = (gridCards: OperativoRow[]) => {
    const items = gridCards.map((card) => itemsById.get(card.id) ?? callItemFromOperativoRow(card));
    if (viewMode === "list") {
      const selectable = items.filter((item) => item.cardId);
      return (
        <CardListTable
          items={items}
          getKey={(item) => item.id}
          loading={loading}
          emptyMessage="No hay tarjetas con esos filtros."
          onOpen={(item) => (item.cardId ? openCallDetail(item.cardId) : undefined)}
          selection={
            canManageGroups
              ? {
                  isSelected: (item) => Boolean(item.cardId && cardSelection.isSelected(item.cardId)),
                  toggle: (item) => (item.cardId ? cardSelection.toggle(item.cardId) : undefined),
                  setAll: (checked) => {
                    const ids = selectable.map((item) => item.cardId as string);
                    if (checked) cardSelection.selectMany(ids);
                    else cardSelection.deselectMany(ids);
                  },
                }
              : undefined
          }
          renderActions={(item) =>
            item.cardId ? (
              <button
                type="button"
                onClick={() => openCallDetail(item.cardId as string, { llamar: true })}
                className="rounded-lg bg-[#0f2544] px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800"
              >
                Llamar
              </button>
            ) : null
          }
        />
      );
    }
    return (
      <CardTileGrid
        items={items}
        getKey={(item) => item.id}
        renderItem={renderTile}
        loading={loading}
        emptyMessage="No hay tarjetas con esos filtros."
      />
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operativo de Llamadas & Agilizaciones"
        subtitle={`${pagination.total} tarjetas registradas en esta vista`}
      />

      {/* FILTERBAR: BUSCADOR, FACETAS, VISTAS Y AGRUPACIONES (ODOO STYLE) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {tab === "extensiones-sla" ? (
            <CallTabsDropdown tab={tab} onTabChange={setTab} />
          ) : (
            <AssignedToMeChip filters={filters} setFilters={setFilters} />
          )}
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs"
          >
            Reporte de Contactos
          </button>
        </div>
        {tab !== "extensiones-sla" ? (
          <CardFilterBar
            preset="llamadas"
            resource="operativo"
            sectionKey="operativo"
            filters={filters}
            onFilterChange={(next) =>
              setFilters({ ...normalizeDateRangeFilters(next), page: "1", pageSize: filters.pageSize || "50" })
            }
            onReset={resetFilters}
            searchPlaceholder="Buscar por TC, cédula, nombre o referencia..."
            extraFacets={extraFacets}
            sources={facetSources}
            groupByOptions={OPERATIVO_GROUP_BY_OPTIONS}
            allowedViews={OPERATIVO_VIEWS}
            currentView={viewMode}
            onViewChange={setViewMode}
            menuSections={[buildCallTabsSection(tab, setTab)]}
            onResetExtensions={() => setTab(DEFAULT_OPERATIVE_TAB)}
            {...dateRangeFilterBarProps({
              fields: OPERATIVO_DATE_FILTER_FIELDS,
              filters,
              onChange: (next) => setFilters({ ...next, page: "1" }),
              // `days` only scopes the activos branch of the API; elsewhere it is ignored, so no chip.
              fallbackChipLabel: (key) => (key === "days" && tab !== "activos" ? null : undefined),
            })}
          />
        ) : null}
      </div>

      {/* URGENT NOTIFICATIONS PANEL */}
      {urgentNotifications.length ? (
        <Panel title="Alertas Urgentes de Operativo">
          <div className="space-y-2">
            {urgentNotifications.map((item) => (
              <div
                key={`${item.urgentCaseId}-${item.nextNotificationAt}`}
                className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs flex justify-between items-center"
              >
                <div>
                  <p className="font-bold text-rose-900">
                    {item.label} - {item.cliente} ({item.tc})
                  </p>
                  <p className="text-rose-800">
                    {item.provincia} - Próxima alerta: {formatUrgentClock(item.nextNotificationAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openCallDetail(item.cardId, { llamar: true })}
                  className="rounded-lg bg-rose-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-800"
                >
                  Abrir Wizard
                </button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* MAIN VIEW CONTENT */}
      {tab === "extensiones-sla" ? (
        <SLAExtensionRequestsTable isAdmin={true} />
      ) : (
        <Panel
          title={
            tab === "activos"
              ? "Cola de Clientes Activos (Por Llamar)"
              : tab === "contactadas"
                ? "Tarjetas Contactadas Exitosamente"
                : tab === "urgentes"
                  ? "Casos Urgentes"
                  : tab === "no-contactadas"
                    ? "Tarjetas No Contactadas (Intentos Realizados)"
                    : tab === "traslados"
                      ? "Tarjetas con Solicitud de Traslado"
                      : "Solicitudes de Retorno al Banco"
          }
        >
          {groupedCards ? (
            <div className="space-y-4">
              {isGroupByGrupo ? <CardGroupFanoutNote pageScopedCounts /> : null}
              <NestedGroupList
                groups={groupedCards}
                variant="blocks"
                isCollapsed={collapsedGroups.isCollapsed}
                onToggle={collapsedGroups.toggle}
                selection={groupSelection}
                countLabel={(count) => bucketCountLabel(count, null)}
                renderRows={(groupCards) => renderTileGrid(groupCards)}
              />
              {!groupedCards.length && !loading ? (
                <p className="py-12 text-center text-sm text-slate-500">No hay tarjetas con esos filtros.</p>
              ) : null}
            </div>
          ) : (
            renderTileGrid(cards)
          )}

          {/* PAGINATOR */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs text-slate-600 bg-white">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> ·{" "}
                <strong>{pagination.total}</strong> registros
              </span>
              <span className="text-slate-300">|</span>
              <label className="flex items-center gap-1">
                <span>Por página:</span>
                <select
                  aria-label="Tarjetas por página"
                  value={filters.pageSize || "50"}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      pageSize: event.target.value,
                      page: "1",
                    }))
                  }
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={String(size)}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.max(1, (Number(prev.page) || 1) - 1)) }))}
                disabled={(Number(filters.page) || 1) <= 1}
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.min(pagination.totalPages, (Number(prev.page) || 1) + 1)) }))}
                disabled={(Number(filters.page) || 1) >= pagination.totalPages}
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </Panel>
      )}

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
          actions={
            <>
              <button
                type="button"
                onClick={() => setCallAssign({ mode: "assign", cardIds: [...cardSelection.ids] })}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Asignar a operario
              </button>
              <button
                type="button"
                onClick={() => setCallAssign({ mode: "unassign", cardIds: [...cardSelection.ids] })}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <UserMinus className="h-3.5 w-3.5" />
                Quitar asignación
              </button>
            </>
          }
        />
      ) : null}
      {groupActionError ? (
        <p className="text-xs font-semibold text-red-600">{groupActionError}</p>
      ) : null}

      {canManageGroups && assignModalMode ? (
        <CardGroupAssignModal
          cardIds={cardSelection.ids}
          /* This screen cannot compute an off-filter count: the route
             hand-builds `where` across three tab branches and filters rows in
             memory before slicing, so no single `prisma.card.count` answers
             it. Saying so is the only honest option - 0 would read as a
             measured zero, null would never stop loading. */
          offFilterCount={OFF_FILTER_COUNT_UNAVAILABLE}
          groups={cardGroups.groups}
          initialMode={assignModalMode}
          onClose={() => setAssignModalMode(null)}
          onSuccess={() => void afterGroupAction()}
        />
      ) : null}

      {callAssign ? (
        <CallAssignModal
          cardIds={callAssign.cardIds}
          mode={callAssign.mode}
          onClose={() => setCallAssign(null)}
          onAssigned={() => void afterGroupAction()}
          onUnassigned={() => void afterGroupAction()}
        />
      ) : null}

      {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}

      {/* REPORT MODAL */}
      {showReport ? (
        <ContactReportModal onClose={() => setShowReport(false)} onExportDailyZip={exportDailyZip} />
      ) : null}
    </div>
  );
}
