"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { FilterBar, type ViewType } from "@/components/filters/filter-bar";
import { CardTile } from "@/components/cards/card-tile";
import { CardTileGrid } from "@/components/cards/card-tile-grid";
import { CardListTable } from "@/components/cards/card-list-table";
import { ContactReportModal } from "@/components/llamadas/contact-report-modal";
import { useCardListFilters } from "@/lib/use-card-list-filters";
import { useCallOperators } from "@/lib/llamadas/use-call-operators";
import { callItemFromOperativoRow, type CallListItem, type OperativoRowLike } from "@/lib/llamadas/call-list-item";
import { callDetailHref, writeNavContext } from "@/lib/llamadas/nav-context";

/**
 * Calls overhaul: "Mis gestiones asignadas" — cards whose call work is
 * assigned to the session operator (`GET /api/llamadas/asignaciones?mine=1`).
 * ADMIN can switch to any operator (`assignedToId`). Opening a tile stores
 * the nav context so the detail screen can move prev/next across this list.
 */

const ASIGNACIONES_ENDPOINT = "/api/llamadas/asignaciones";
const DEFAULT_FILTERS = { page: "1", pageSize: "50" };
const MIS_GESTIONES_VIEWS: ViewType[] = ["cards", "list"];

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type AsignacionesResponse = { cards?: OperativoRowLike[]; pagination?: PaginationMeta; error?: string };

/** Query params of the list WITHOUT `page` / `pageSize`. */
function buildListParams(filters: Record<string, string>, isAdmin: boolean) {
  const params: Record<string, string> = {};
  const operatorId = isAdmin ? filters.operador : "";
  if (operatorId) params.assignedToId = operatorId;
  else params.mine = "1";
  if (filters.q?.trim()) params.q = filters.q.trim();
  return params;
}

export default function MisGestionesClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { filters, setFilters, resetFilters } = useCardListFilters({ defaults: DEFAULT_FILTERS });
  const { operadores } = useCallOperators(isAdmin);
  const [rows, setRows] = useState<OperativoRowLike[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [viewMode, setViewMode] = useState<ViewType>("cards");

  const listParams = useMemo(() => buildListParams(filters, isAdmin), [filters, isAdmin]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(listParams);
    params.set("page", filters.page || "1");
    params.set("pageSize", filters.pageSize || "50");
    setLoading(true);
    setError(null);
    fetch(`${ASIGNACIONES_ENDPOINT}?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as AsignacionesResponse;
        if (!alive) return;
        if (!res.ok) {
          setError(json.error ?? "No se pudieron cargar las gestiones asignadas");
          setRows([]);
          return;
        }
        setRows(json.cards ?? []);
        if (json.pagination) setPagination(json.pagination);
      })
      .catch(() => {
        if (alive) setError("No se pudieron cargar las gestiones asignadas");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [listParams, filters.page, filters.pageSize]);

  const items = useMemo(() => rows.map(callItemFromOperativoRow), [rows]);

  const openCallDetail = useCallback(
    (cardId: string, options: { llamar?: boolean } = {}) => {
      const page = Number(filters.page) || 1;
      writeNavContext({
        ids: items.map((item) => item.cardId).filter((id): id is string => Boolean(id)),
        originUrl: `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`,
        originLabel: "Mis gestiones",
        source: {
          endpoint: ASIGNACIONES_ENDPOINT,
          params: listParams,
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
    [items, filters.page, pathname, listParams, pagination, router],
  );

  const callButton = (item: CallListItem) =>
    item.cardId ? (
      <button
        type="button"
        onClick={() => openCallDetail(item.cardId as string, { llamar: true })}
        className="rounded-lg bg-[#0f2544] px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800"
      >
        Llamar
      </button>
    ) : null;

  const renderTile = (item: CallListItem) => (
    <CardTile
      data={item}
      onOpen={item.cardId ? () => openCallDetail(item.cardId as string) : undefined}
      actions={callButton(item)}
    />
  );

  const page = Number(filters.page) || 1;
  const viewingOther = isAdmin && Boolean(filters.operador);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mis gestiones asignadas"
        subtitle={`${pagination.total} tarjetas asignadas${viewingOther ? " al operario seleccionado" : " a ti"}`}
        actions={
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-slate-800"
          >
            Reporte de contactos
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        {isAdmin ? (
          <label className="text-xs font-semibold text-slate-600">
            Operario
            <select
              aria-label="Operario"
              value={filters.operador ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, operador: event.target.value, page: "1" }))}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Mis gestiones</option>
              {operadores.map((operador) => (
                <option key={operador.id} value={operador.id}>
                  {operador.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <FilterBar
          resource="llamadas-asignaciones"
          sectionKey="mis-gestiones"
          filters={filters}
          onFilterChange={(next) => setFilters({ ...next, page: "1", pageSize: filters.pageSize || "50" })}
          onReset={resetFilters}
          searchPlaceholder="Buscar por TC, cédula, nombre o referencia..."
          allowedViews={MIS_GESTIONES_VIEWS}
          currentView={viewMode}
          onViewChange={setViewMode}
          className="min-w-0 flex-1"
        />
      </div>

      <Panel>
        {error ? <p className="mb-3 text-sm font-semibold text-red-600">{error}</p> : null}
        {viewMode === "list" ? (
          <CardListTable
            items={items}
            getKey={(item) => item.id}
            onOpen={(item) => (item.cardId ? openCallDetail(item.cardId) : undefined)}
            renderActions={(item) => callButton(item)}
            loading={loading}
            emptyMessage={loading ? "Cargando..." : "No hay tarjetas asignadas."}
          />
        ) : (
          <CardTileGrid
            items={items}
            getKey={(item) => item.id}
            renderItem={renderTile}
            loading={loading}
            emptyMessage={loading ? "Cargando..." : "No hay tarjetas asignadas."}
          />
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
          <span>
            Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> ·{" "}
            <strong>{pagination.total}</strong> registros
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.max(1, page - 1)) }))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.min(pagination.totalPages, page + 1)) }))}
              disabled={page >= pagination.totalPages}
              className="rounded-lg border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </Panel>

      {showReport ? <ContactReportModal onClose={() => setShowReport(false)} defaultOnlyMine={!viewingOther} /> : null}
    </div>
  );
}
