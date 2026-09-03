"use client";

import { getRouteLifecycle } from "@/lib/route-item-lifecycle";

export type RouteProgressRouteItem = {
  id: string;
  card: { metadata: unknown };
};

export type RouteProgressRoute = {
  id: string;
  fecha: string;
  messenger: { nombre: string };
  items: RouteProgressRouteItem[];
};

export type RouteProgressPanelProps = {
  routes: RouteProgressRoute[];
  formatDate: (value: string) => string;
  onSelectRoute: (routeId: string) => void;
  emptyMessage?: string;
};

function MiniLotStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <p className={`font-display text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

/**
 * The route-progress grid relocated from the "Lotes" module tab (Slice 2,
 * task 2.2). Renders REAL `Route`/`RouteItem` data, correctly labeled "RUTA
 * {id}" — never "LOTE", which was the pre-relocation mislabeling this slice
 * fixes. Lives under "Operativo de rutas" -> "progreso" sub-tab, distinct
 * from the scan/pistoleo panel.
 */
export function RouteProgressPanel({
  routes,
  formatDate,
  onSelectRoute,
  emptyMessage = "No hay rutas en progreso para la fecha.",
}: RouteProgressPanelProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {routes.map((route) => {
        const total = route.items.length;
        const recibidas = route.items.filter(
          (item) => getRouteLifecycle(item) === "ACUSE RECIBIDO",
        ).length;
        const retornadas = route.items.filter(
          (item) => getRouteLifecycle(item) === "DEVUELTA A TIENDA",
        ).length;
        const percent = total ? Math.round(((recibidas + retornadas) / total) * 100) : 0;

        return (
          <article key={route.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-xs font-bold tracking-wide text-blue-700">
                RUTA {route.id.slice(-5).toUpperCase()}
              </p>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                {percent}% procesado
              </span>
            </div>
            <p className="font-display text-base font-bold text-slate-900">{route.messenger.nombre}</p>
            <p className="text-xs text-slate-500">{formatDate(route.fecha)}</p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniLotStat label="Total" value={total} color="text-slate-900" />
              <MiniLotStat label="Acuses" value={recibidas} color="text-emerald-700" />
              <MiniLotStat label="Devueltas" value={retornadas} color="text-rose-700" />
            </div>

            <div className="mt-3 h-1.5 rounded bg-slate-100">
              <div className="h-full rounded bg-blue-700" style={{ width: `${percent}%` }} />
            </div>

            <button
              onClick={() => onSelectRoute(route.id)}
              className="mt-3 w-full rounded-lg bg-[#0f2544] px-3 py-2 text-sm font-semibold text-white"
            >
              Ver tarjetas
            </button>
          </article>
        );
      })}
      {!routes.length ? <p className="text-sm text-slate-500">{emptyMessage}</p> : null}
    </div>
  );
}
