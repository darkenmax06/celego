"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { ContactStateBadge } from "@/components/cards/contact-state-badge";
import { CardTile } from "@/components/cards/card-tile";
import { CardTileGrid } from "@/components/cards/card-tile-grid";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useCardListFilters } from "@/lib/use-card-list-filters";
import { groupByLevelLabel, type ViewType } from "@/components/filters/filter-bar";
import { CardFilterBar } from "@/components/filters/card-filter-bar";
import { AssignedToMeChip } from "@/components/filters/assigned-to-me-chip";
import { NestedGroupList, useCollapsedGroups, type GroupSelection } from "@/components/grouping/nested-group-list";
import { dateRangeFilterBarProps } from "@/components/filters/date-range-filter";
import {
  cardDateFilterOptions,
  cardDateGroupOptions,
  getCardDateGroup,
  parseDateGroupToken,
  formatCardDate,
} from "@/lib/card-date-fields";
import {
  normalizeDateRangeFilters,
  parseDateRangeParamKey,
  readDateRanges,
} from "@/lib/date-range-params";
import {
  CARD_GROUP_BY_FIELD,
  bucketCountLabel,
  cardGroupBuckets,
  groupRowsNested,
  parseGroupByLevels,
  toGroupNameMap,
  type GroupNode,
} from "@/lib/grouping";
import { useCardGroupBucketTotals } from "@/lib/use-card-group-bucket-totals";
import { useCardGroups } from "@/lib/use-card-groups";
import { useCardSelection } from "@/lib/use-card-selection";
import { CardGroupAssignModal } from "@/components/cards/card-group-assign-modal";
import { CardGroupFanoutNote } from "@/components/cards/card-group-fanout-note";
import { CardSelectCheckbox } from "@/components/cards/card-select-checkbox";
import { CardSelectionBar, type SelectedCardEntry } from "@/components/cards/card-selection-bar";
import { TableColumnSelector } from "@/components/ui/table-column-selector";
import {
  useResizableColumns,
  ResizableHeader,
} from "@/components/ui/use-resizable-columns";
import { callItemFromSlaRow, callItemGroupKey, type CallListItem } from "@/lib/llamadas/call-list-item";
import { callDetailHref, writeNavContext } from "@/lib/llamadas/nav-context";

type Row = {
  id: string;
  tc: string;
  status: string;
  slaDueDate: string | null;
  dispatchDate: string | null;
  provincia: string;
  zona: string;
  tipoTarjeta: string;
  adicional: boolean;
  adicionalNumero: number;
  nombre: string;
  cedula: string;
  direccion: string;
  telefonos: string;
  mensajero: string;
  mensajeroId: string;
  diasVencidos: number;
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
  /** Ids of the CardGroups this card belongs to. Names resolve via useCardGroups. */
  groupIds?: string[];
  asignadoA?: { id: string; name: string } | null;
  attempts?: number | null;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Payload = {
  filters: { messengerId: string };
  total: number;
  rows: Row[];
  pagination?: PaginationMeta;
};

const EXPORT_COLUMNS = [
  { key: "nombre", label: "Cliente", locked: true },
  { key: "cedula", label: "Cédula" },
  { key: "tc", label: "TC" },
  { key: "contactoEstado", label: "Gestión Contacto" },
  { key: "status", label: "Status" },
  { key: "slaDueDate", label: "SLA vence" },
  { key: "diasVencidos", label: "Días vencidos" },
  { key: "dispatchDate", label: "Fecha despacho" },
  { key: "mensajero", label: "Mensajero" },
  { key: "provincia", label: "Provincia" },
  { key: "zona", label: "Zona" },
  { key: "tipoTarjeta", label: "Tipo tarjeta" },
  { key: "adicional", label: "Adicional" },
  { key: "direccion", label: "Dirección" },
  { key: "telefonos", label: "Contactos" },
] as const;

type ExportColumnKey = (typeof EXPORT_COLUMNS)[number]["key"];

const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
  "nombre",
  "cedula",
  "tc",
  "contactoEstado",
  "status",
  "slaDueDate",
  "diasVencidos",
  "tipoTarjeta",
  "adicional",
  "mensajero",
  "provincia",
  "direccion",
  "telefonos",
];

const DEFAULT_SLA_COLUMN_WIDTHS: Record<string, number> = {
  nombre: 220,
  cedula: 130,
  tc: 180,
  contactoEstado: 160,
  status: 140,
  slaDueDate: 120,
  diasVencidos: 120,
  dispatchDate: 130,
  mensajero: 160,
  provincia: 140,
  zona: 130,
  tipoTarjeta: 120,
  adicional: 110,
  direccion: 240,
  telefonos: 150,
};

const SLA_DATE_FILTER_FIELDS = cardDateFilterOptions([
  "slaDueDate",
  "dispatchDate",
  "reassignedAt",
  "createdAt",
  "updatedAt",
]);

const SLA_GROUP_BY_OPTIONS = [
  { field: "contactoEstado", label: "Gestión Contacto" },
  { field: "productType", label: "Producto" },
  { field: "messengerId", label: "Mensajero" },
  { field: "provincia", label: "Provincia" },
  { field: "zona", label: "Zona" },
  { field: "status", label: "Status" },
  { field: "asignado", label: "Asignado a" },
  { field: "canalContacto", label: "Canal de contacto" },
  { field: CARD_GROUP_BY_FIELD, label: "Grupo" },
  ...cardDateGroupOptions(["slaDueDate", "dispatchDate", "fechaPreferenciaEntrega"]),
];

const SLA_ENDPOINT = "/api/sla-vencidas";
const DEFAULT_FILTERS = { messengerId: "ALL", page: "1", pageSize: "100" };
/** Tiles are the default; the column table stays available as the alternate view. */
const SLA_VIEWS: ViewType[] = ["cards", "list"];

/** Query params of the list WITHOUT `page` / `pageSize` / `groupBy`. */
function buildListParams(filters: Record<string, string>) {
  const params: Record<string, string> = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== "ALL" && k !== "page" && k !== "pageSize" && k !== "groupBy") params[k] = v;
  });
  return params;
}

/** Only the date range params, for the exports that must honour the list filters. */
function dateParamsOf(filters: Record<string, string>) {
  return Object.fromEntries(Object.entries(filters).filter(([key, value]) => value && parseDateRangeParamKey(key)));
}

function dateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-DO");
}

function getSlaGroupKey(row: Row, groupBy: string): { key: string; label: string } {
  const dateGroup = parseDateGroupToken(groupBy);
  if (dateGroup) return getCardDateGroup(row, dateGroup.key, dateGroup.granularity);
  switch (groupBy) {
    case "contactoEstado": {
      if (row.contactoEstado === "RETORNO_SOLICITADO") return { key: "RETORNO_SOLICITADO", label: "⚠ Retorno Solicitado" };
      if (row.contactoEstado === "TRASLADO_SOLICITADO") return { key: "TRASLADO_SOLICITADO", label: "✈ Traslado Solicitado" };
      if (row.contactoEstado === "CONTACTADA") return { key: "CONTACTADA", label: "✓ Contactadas" };
      return { key: "NO_CONTACTADA", label: "○ No Contactadas / Pendientes" };
    }
    case "messengerId":
    case "mensajero":
      return { key: row.mensajeroId || "UNASSIGNED", label: row.mensajero || "Sin Asignar" };
    case "provincia":
      return { key: row.provincia || "SIN_PROVINCIA", label: row.provincia || "Sin Provincia" };
    case "zona":
      return { key: row.zona || "SIN_ZONA", label: row.zona || "Sin Zona" };
    case "status":
      return { key: row.status || "SIN_ESTADO", label: row.status || "Sin Estado" };
    case "tipoTarjeta":
      return { key: row.tipoTarjeta || "SIN_TIPO", label: row.tipoTarjeta || "Sin Tipo" };
    case "asignado":
    case "canalContacto":
      return callItemGroupKey(callItemFromSlaRow(row), groupBy);
    case "adicional":
      return row.adicional
        ? { key: `ADIC_${row.adicionalNumero}`, label: `Adicional ${row.adicionalNumero}` }
        : { key: "PRINCIPAL", label: "Principal" };
    default: {
      const val = (row as unknown as Record<string, unknown>)[groupBy];
      if (val !== undefined && val !== null) {
        return { key: String(val), label: String(val) };
      }
      return { key: "ALL", label: "General" };
    }
  }
}

type SlaVencidasClientProps = {
  /** Stage B, Task B1: gates the selection column and bulk bar to ADMIN/OPERADOR. */
  role: string;
};

export default function SlaVencidasClient({ role }: SlaVencidasClientProps) {
  const canManageGroups = role === "ADMIN" || role === "OPERADOR";
  const router = useRouter();
  const pathname = usePathname();
  const { filters, setFilters, resetFilters } = useCardListFilters({ defaults: DEFAULT_FILTERS });
  const [viewMode, setViewMode] = useState<ViewType>("cards");
  const cardGroups = useCardGroups();
  // The page already owns the card groups (it reloads them after a group
  // action), so the filter bar reuses them instead of fetching its own copy.
  const facetSources = useMemo(() => ({ groups: cardGroups.groups }), [cardGroups.groups]);
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 100,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exportColumns, setExportColumns] = usePersistentState<ExportColumnKey[]>(
    "sla-vencidas:columns",
    DEFAULT_EXPORT_COLUMNS,
  );
  const { widths: columnWidths, updateWidth: onColumnResize } = useResizableColumns(
    "sla-vencidas",
    DEFAULT_SLA_COLUMN_WIDTHS,
  );
  const collapsedGroups = useCollapsedGroups();

  // Stage B, Task B1: app-wide card selection and bulk group actions.
  const cardSelection = useCardSelection();
  const [assignModalMode, setAssignModalMode] = useState<"existing" | "new" | null>(null);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);
  const [offFilterCount, setOffFilterCount] = useState<number | null>(null);
  const [offFilterError, setOffFilterError] = useState<string | null>(null);

  const activeGroupFilterIds = (filters.grupo ?? "").split(",").filter(Boolean);

  /**
   * Identity lookup for the selection review panel, built ONLY from the rows
   * this screen loaded. An id missing here is selected but outside this view
   * (another page, another filter, or another screen entirely - the selection
   * is app-wide), and the bar renders it as a labelled minimal entry.
   */
  const cardsById = useMemo(() => {
    const map: Record<string, SelectedCardEntry> = {};
    for (const row of rows) {
      map[row.id] = { id: row.id, tc: row.tc, customerName: row.nombre, cedula: row.cedula };
    }
    return map;
  }, [rows]);

  /**
   * The off-filter count can only be answered by the database - the browser
   * cannot know whether an unloaded card matches the active filter - so it is
   * fetched from the resource-generic endpoint when the modal opens. `null`
   * means "still loading" and is rendered as such, never as a fabricated 0.
   */
  useEffect(() => {
    if (!assignModalMode) return;
    let cancelled = false;
    setOffFilterCount(null);
    setOffFilterError(null);
    (async () => {
      try {
        const response = await fetch("/api/list-query/off-filter-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resource: "sla-vencidas",
            cardIds: cardSelection.ids,
            filters,
          }),
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
    await loadData(filters);
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

  async function loadData(currentFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(currentFilters).forEach(([k, v]) => {
      if (v && v !== "ALL") params.set(k, v);
    });

    const query = params.toString();
    const res = await fetch(`${SLA_ENDPOINT}${query ? `?${query}` : ""}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({ error: "No se pudo cargar SLA vencidas" }))) as
      | Payload
      | { error: string };

    if (!res.ok || "error" in json) {
      setMessage(("error" in json && json.error) || "No se pudo cargar SLA vencidas");
      setLoading(false);
      return;
    }

    setRows(json.rows ?? []);
    if (json.pagination) {
      setPagination(json.pagination);
    } else {
      setPagination({
        page: 1,
        pageSize: json.total || json.rows.length,
        total: json.total || json.rows.length,
        totalPages: 1,
      });
    }
    setMessage("");
    setLoading(false);
  }

  useEffect(() => {
    void loadData(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const groupLevels = useMemo(() => parseGroupByLevels(filters.groupBy), [filters.groupBy]);
  const groupNameById = useMemo(() => toGroupNameMap(cardGroups.groups), [cardGroups.groups]);

  /** "Grupo" is the only level where a row lands in several buckets (fan-out). */
  const isGroupByGrupo = groupLevels.includes(CARD_GROUP_BY_FIELD);

  /** Server totals only describe outermost buckets; inner levels keep client-side counts. */
  const bucketTotals = useCardGroupBucketTotals("sla-vencidas", filters, groupLevels[0] === CARD_GROUP_BY_FIELD);

  const groupedRows = useMemo(
    () =>
      groupRowsNested(rows, groupLevels, (row: Row, token) =>
        token === CARD_GROUP_BY_FIELD ? cardGroupBuckets(row.groupIds, groupNameById) : getSlaGroupKey(row, token),
      ),
    [rows, groupLevels, groupNameById],
  );

  const groupCountLabel = (count: number, group: GroupNode<Row>) =>
    group.depth === 0 && group.token === CARD_GROUP_BY_FIELD
      ? bucketCountLabel(count, bucketTotals?.[group.key] ?? null)
      : `${count} ${count === 1 ? "tarjeta" : "tarjetas"}`;

  const groupSelection: GroupSelection<Row> | undefined = canManageGroups
    ? {
        getRowId: (row) => row.id,
        isSelected: cardSelection.isSelected,
        onChange: (ids, checked) => (checked ? cardSelection.selectMany(ids) : cardSelection.deselectMany(ids)),
      }
    : undefined;

  const items = useMemo(() => rows.map(callItemFromSlaRow), [rows]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  /** Stores the visible order (for prev/next on the detail screen) and opens it. */
  const openCallDetail = useCallback(
    (cardId: string, options: { llamar?: boolean } = {}) => {
      // Grouping by "Grupo" fans a card out into several buckets; keep its first position only.
      const visible = groupedRows ? groupedRows.flatMap((group) => group.rows) : rows;
      writeNavContext({
        ids: [...new Set(visible.map((row) => row.id))],
        originUrl: `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`,
        originLabel: "Vencimientos",
        source: {
          endpoint: SLA_ENDPOINT,
          params: buildListParams(filters),
          listKey: "rows",
          idKey: "id",
          pageSize: pagination.pageSize,
          total: pagination.total,
          totalPages: pagination.totalPages,
          firstPage: pagination.page,
          lastPage: pagination.page,
        },
      });
      router.push(callDetailHref(cardId, options));
    },
    [groupedRows, rows, pathname, filters, pagination, router],
  );

  const renderTile = (item: CallListItem) => (
    <CardTile
      data={item}
      onOpen={() => openCallDetail(item.id)}
      selection={
        canManageGroups
          ? { checked: cardSelection.isSelected(item.id), onToggle: () => cardSelection.toggle(item.id) }
          : undefined
      }
      actions={
        <button
          type="button"
          onClick={() => openCallDetail(item.id, { llamar: true })}
          className="rounded-lg bg-[#0f2544] px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800"
        >
          Llamar
        </button>
      }
    />
  );

  const renderTileGrid = (gridRows: Row[]) => (
    <CardTileGrid
      items={gridRows.map((row) => itemsById.get(row.id) ?? callItemFromSlaRow(row))}
      getKey={(item) => item.id}
      renderItem={renderTile}
      loading={loading}
      emptyMessage={loading ? "Cargando..." : "No hay tarjetas SLA vencidas para este filtro."}
    />
  );

  async function exportJpgZip() {
    const params = new URLSearchParams(dateParamsOf(filters));
    if (filters.messengerId && filters.messengerId !== "ALL") {
      params.set("messengerId", filters.messengerId);
    }
    const res = await fetch(`/api/sla-vencidas/export?${params.toString()}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar imagenes" }));
      setMessage(json.error ?? "No se pudo exportar imagenes");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sla-vencidas-${filters.messengerId === "ALL" ? "general" : filters.messengerId}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Export JPG generado");
  }

  async function exportList(format: "csv" | "xlsx" | "pdf") {
    if (!exportColumns.length) {
      setMessage("Selecciona al menos una columna para exportar el listado.");
      return;
    }

    const res = await fetch("/api/sla-vencidas/export-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messengerId: filters.messengerId || "ALL",
        dateRanges: readDateRanges(filters),
        columns: exportColumns,
        format,
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar el listado" }));
      setMessage(json.error ?? "No se pudo exportar el listado");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sla-vencidas-listado.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Listado exportado en ${format.toUpperCase()}`);
  }

  const renderSlaRow = (row: Row) => (
    <tr
      key={row.id}
      onClick={() => openCallDetail(row.id)}
      className="cursor-pointer border-t border-slate-100 align-top hover:bg-blue-50/50 transition-colors"
    >
      {canManageGroups ? (
        <td className="px-3 py-2.5">
          <CardSelectCheckbox
            checked={cardSelection.isSelected(row.id)}
            onChange={() => cardSelection.toggle(row.id)}
            label={`Seleccionar tarjeta ${row.tc}`}
          />
        </td>
      ) : null}
      {exportColumns.includes("nombre") ? (
        <td className="px-3 py-2.5 font-semibold text-slate-900 truncate" title={row.nombre}>
          <div className="flex items-center gap-1.5 min-w-0">
            <PhoneCall className="h-3.5 w-3.5 text-blue-600 opacity-60 shrink-0" />
            <span className="truncate">{row.nombre}</span>
          </div>
        </td>
      ) : null}
      {exportColumns.includes("tc") || exportColumns.includes("cedula") ? (
        <td className="px-3 py-2.5 truncate">
          {exportColumns.includes("tc") ? (
            <p className="font-mono font-bold text-blue-700 truncate" title={row.tc}>{row.tc}</p>
          ) : null}
          {exportColumns.includes("cedula") ? (
            <p className="text-xs text-slate-500 truncate" title={row.cedula}>{row.cedula}</p>
          ) : null}
        </td>
      ) : null}
      {exportColumns.includes("contactoEstado" as ExportColumnKey) ? (
        <td className="px-3 py-2.5 truncate">
          {(() => {
            const item = itemsById.get(row.id);
            return item?.contactoEstado ? (
              <ContactStateBadge value={item.contactoEstado} canal={item.canalContacto} className="text-[11px]" />
            ) : null;
          })()}
        </td>
      ) : null}
      {exportColumns.includes("mensajero") ? (
        <td className="px-3 py-2.5 text-slate-700 truncate" title={row.mensajero || "SIN ASIGNAR"}>
          <span className="truncate block">{row.mensajero || "SIN ASIGNAR"}</span>
        </td>
      ) : null}
      {exportColumns.includes("provincia") || exportColumns.includes("zona") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={row.provincia || row.zona}>
          <span className="truncate block">{row.provincia || row.zona}</span>
        </td>
      ) : null}
      {exportColumns.includes("tipoTarjeta") || exportColumns.includes("adicional") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">
          <span className="truncate block">
            {row.adicional ? `ADIC. ${row.adicionalNumero}` : "PRINCIPAL"}
          </span>
        </td>
      ) : null}
      {exportColumns.includes("status") ? (
        <td className="px-3 py-2.5 truncate">
          <StatusBadge value={row.status} />
        </td>
      ) : null}
      {exportColumns.includes("slaDueDate") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">
          <span className="truncate block">{dateLabel(row.slaDueDate)}</span>
        </td>
      ) : null}
      {exportColumns.includes("dispatchDate") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">
          <span className="truncate block">{formatCardDate(row, "dispatchDate")}</span>
        </td>
      ) : null}
      {exportColumns.includes("diasVencidos") ? (
        <td className="px-3 py-2.5 text-rose-700 font-semibold truncate">
          <span className="truncate block">{row.diasVencidos} día(s)</span>
        </td>
      ) : null}
      {exportColumns.includes("direccion") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={row.direccion || ""}>
          <span className="truncate block">{row.direccion || "-"}</span>
        </td>
      ) : null}
      {exportColumns.includes("telefonos") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={row.telefonos || ""}>
          <span className="truncate block">{row.telefonos || "-"}</span>
        </td>
      ) : null}
    </tr>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tarjetas con SLA vencidas"
        subtitle="Haz clic en cualquier tarjeta para abrir su gestión de llamadas: historial, contacto, traslados o retornos"
      />

      <div className="space-y-2">
        <div className="flex justify-end">
          <AssignedToMeChip filters={filters} setFilters={setFilters} />
        </div>
        <CardFilterBar
          preset="llamadas"
          resource="sla-vencidas"
          sectionKey="sla-vencidas"
          filters={filters}
          onFilterChange={(next) =>
            setFilters({ ...normalizeDateRangeFilters(next), page: "1", pageSize: filters.pageSize || "100" })
          }
          onReset={resetFilters}
          searchPlaceholder="Buscar por TC, cédula, nombre, provincia o zona..."
          sources={facetSources}
          groupByOptions={SLA_GROUP_BY_OPTIONS}
          allowedViews={SLA_VIEWS}
          currentView={viewMode}
          onViewChange={setViewMode}
          {...dateRangeFilterBarProps({
            fields: SLA_DATE_FILTER_FIELDS,
            filters,
            onChange: (next) => setFilters({ ...next, page: "1" }),
          })}
        />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void exportJpgZip()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Exportar JPG (ZIP)
            </button>
            <button
              type="button"
              onClick={() => void exportList("csv")}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => void exportList("xlsx")}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => void exportList("pdf")}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exportar PDF
            </button>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
            Total vencidas: {pagination.total} {pagination.total > rows.length ? `(Mostrando ${rows.length})` : ""}
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {loading ? "Cargando..." : `Listado (${rows.length})`}
            </h2>
            {groupLevels.length ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Agrupado por:{" "}
                {groupLevels.map((token) => groupByLevelLabel(token, SLA_GROUP_BY_OPTIONS)).join(" › ")}
              </span>
            ) : null}
            {isGroupByGrupo ? <CardGroupFanoutNote /> : null}
          </div>
          {viewMode === "list" ? (
            <TableColumnSelector
              columns={EXPORT_COLUMNS}
              visibleColumns={exportColumns}
              onChange={setExportColumns}
            />
          ) : null}
        </div>

        {viewMode !== "list" ? (
          groupedRows ? (
            <NestedGroupList
              groups={groupedRows}
              variant="blocks"
              isCollapsed={collapsedGroups.isCollapsed}
              onToggle={collapsedGroups.toggle}
              selection={groupSelection}
              countLabel={groupCountLabel}
              renderRows={(groupRows) => renderTileGrid(groupRows)}
            />
          ) : (
            renderTileGrid(rows)
          )
        ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          {(() => {
            const visibleHeaderCount = [
              exportColumns.includes("nombre"),
              exportColumns.includes("tc") || exportColumns.includes("cedula"),
              exportColumns.includes("mensajero"),
              exportColumns.includes("provincia") || exportColumns.includes("zona"),
              exportColumns.includes("tipoTarjeta") || exportColumns.includes("adicional"),
              exportColumns.includes("status"),
              exportColumns.includes("slaDueDate"),
              exportColumns.includes("dispatchDate"),
              exportColumns.includes("diasVencidos"),
              exportColumns.includes("direccion"),
              exportColumns.includes("telefonos"),
            ].filter(Boolean).length + (canManageGroups ? 1 : 0);

            return (
              <table className="w-full min-w-[1200px] text-left text-sm table-fixed">
                <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600 border-b border-slate-200">
                  <tr>
                    {canManageGroups ? (
                      <th className="w-10 px-3">
                        <CardSelectCheckbox
                          checked={rows.length > 0 && rows.every((r) => cardSelection.isSelected(r.id))}
                          onChange={(checked) => {
                            if (checked) {
                              cardSelection.selectMany(rows.map((r) => r.id));
                            } else {
                              for (const r of rows) {
                                if (cardSelection.isSelected(r.id)) cardSelection.toggle(r.id);
                              }
                            }
                          }}
                          label="Seleccionar todas en esta página"
                        />
                      </th>
                    ) : null}
                    {exportColumns.includes("nombre") ? (
                      <ResizableHeader
                        columnKey="nombre"
                        label="Cliente"
                        width={columnWidths.nombre}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("tc") || exportColumns.includes("cedula") ? (
                      <ResizableHeader
                        columnKey="tc"
                        label="TC / Cédula"
                        width={columnWidths.tc}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("mensajero") ? (
                      <ResizableHeader
                        columnKey="mensajero"
                        label="Mensajero"
                        width={columnWidths.mensajero}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("provincia") || exportColumns.includes("zona") ? (
                      <ResizableHeader
                        columnKey="provincia"
                        label="Provincia / Zona"
                        width={columnWidths.provincia}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("tipoTarjeta") || exportColumns.includes("adicional") ? (
                      <ResizableHeader
                        columnKey="tipoTarjeta"
                        label="Tipo"
                        width={columnWidths.tipoTarjeta}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("status") ? (
                      <ResizableHeader
                        columnKey="status"
                        label="Status"
                        width={columnWidths.status}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("slaDueDate") ? (
                      <ResizableHeader
                        columnKey="slaDueDate"
                        label="SLA"
                        width={columnWidths.slaDueDate}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("dispatchDate") ? (
                      <ResizableHeader
                        columnKey="dispatchDate"
                        label="Despacho"
                        width={columnWidths.dispatchDate}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("diasVencidos") ? (
                      <ResizableHeader
                        columnKey="diasVencidos"
                        label="Vencida"
                        width={columnWidths.diasVencidos}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("direccion") ? (
                      <ResizableHeader
                        columnKey="direccion"
                        label="Dirección"
                        width={columnWidths.direccion}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("telefonos") ? (
                      <ResizableHeader
                        columnKey="telefonos"
                        label="Contactos"
                        width={columnWidths.telefonos}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {groupedRows ? (
                    <NestedGroupList
                      groups={groupedRows}
                      variant="table"
                      colSpan={visibleHeaderCount}
                      isCollapsed={collapsedGroups.isCollapsed}
                      onToggle={collapsedGroups.toggle}
                      selection={groupSelection}
                      countLabel={groupCountLabel}
                      renderRows={(groupRows) => groupRows.map((row) => renderSlaRow(row))}
                    />
                  ) : (
                    rows.map((row) => renderSlaRow(row))
                  )}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={visibleHeaderCount} className="py-8 text-center text-sm text-slate-500">
                        {loading ? "Cargando..." : "No hay tarjetas SLA vencidas para este filtro."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            );
          })()}
        </div>
        )}

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
                  value={filters.pageSize || "100"}
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

    </div>
  );
}
