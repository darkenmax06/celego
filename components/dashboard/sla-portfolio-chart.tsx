"use client";

import { Pie, PieChart, Sector, type PieSectorShapeProps } from "recharts";
import type { SlaAgingBucket, SlaPortfolio } from "@/lib/dashboard/sla-portfolio";

export type SlaPortfolioSelection = { kind: "alDia" } | { kind: "vencidas" } | { kind: "bucket"; bucket: SlaAgingBucket };

const SEGMENTS = [
  { key: "alDia", label: "Al día", color: "#10b981" },
  { key: "vencidas", label: "Vencidas", color: "#ef4444" },
  { key: "sinSla", label: "Sin SLA", color: "#94a3b8" },
] as const;

const BUCKET_COLORS: Record<SlaAgingBucket["key"], string> = {
  d1to3: "#f59e0b",
  d4to7: "#f97316",
  d8plus: "#dc2626",
};

/**
 * Open cards of the range on time vs overdue against their SLA, plus the
 * overdue ones split by business days late. Clicking opens the matching list;
 * "Sin SLA" has no list filter, so it is informative only.
 */
export function SlaPortfolioChart({
  portfolio,
  loading,
  onSelect,
}: {
  portfolio: SlaPortfolio | undefined;
  loading: boolean;
  onSelect: (selection: SlaPortfolioSelection) => void;
}) {
  const segments = SEGMENTS.map((segment) => ({ ...segment, fill: segment.color, value: portfolio?.[segment.key] ?? 0 })).filter(
    (segment) => segment.value > 0,
  );
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (!portfolio || !total) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        {loading ? "Cargando..." : "Sin tarjetas abiertas en el rango."}
      </div>
    );
  }

  const select = (key: (typeof SEGMENTS)[number]["key"]) => {
    if (key !== "sinSla") onSelect({ kind: key });
  };
  const maxBucket = Math.max(1, ...portfolio.buckets.map((bucket) => bucket.count));
  const overduePct = (portfolio.vencidas / total) * 100;

  return (
    <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-3">
        <div className="relative">
        <PieChart style={{ width: "100%", height: 220 }} responsive margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Pie
            data={segments}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="82%"
            paddingAngle={1}
            isAnimationActive={false}
            onClick={(_, index) => select(segments[index].key)}
            shape={(props: PieSectorShapeProps) => (
              <Sector {...props} className={(props.payload as { key?: string })?.key === "sinSla" ? "" : "cursor-pointer"} />
            )}
          />
        </PieChart>
        {/* HTML overlay: an SVG <Label> gets a (0,0) viewBox on the first responsive render and lands in the corner. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-red-500">{`${overduePct.toFixed(1)}%`}</span>
          <span className="text-xs text-slate-500">vencidas</span>
        </div>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          {segments.map((segment) => (
            <button
              key={segment.key}
              type="button"
              disabled={segment.key === "sinSla"}
              onClick={() => select(segment.key)}
              className="flex items-center gap-1.5 text-xs text-slate-600 enabled:hover:text-slate-900 disabled:cursor-default"
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
              <span className="font-semibold text-slate-800">{segment.value.toLocaleString("es-DO")}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Vencidas por días hábiles de atraso</p>
        <div className="space-y-3">
          {portfolio.buckets.map((bucket) => (
            <button
              key={bucket.key}
              type="button"
              onClick={() => onSelect({ kind: "bucket", bucket })}
              className="block w-full text-left"
            >
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-600">{bucket.label}</span>
                <span className="font-display font-bold text-slate-800">{bucket.count.toLocaleString("es-DO")}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(bucket.count / maxBucket) * 100}%`, backgroundColor: BUCKET_COLORS[bucket.key] }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
