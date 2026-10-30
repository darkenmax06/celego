"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis, type LegendPayload } from "recharts";
import type { DailyFlowPoint } from "@/lib/dashboard/daily-flow";

const SERIES = [
  { key: "despachadas", label: "Despachadas", color: "#3b82f6" },
  { key: "contactadas", label: "Contactadas", color: "#06b6d4" },
  { key: "entregadas", label: "Entregadas", color: "#10b981" },
  { key: "retornadas", label: "Retornadas", color: "#8b5cf6" },
] as const;

function dayLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

/**
 * Daily dispatched vs contacted vs delivered vs returned cards. Hovering a
 * legend item dims the other lines.
 */
export function DailyFlowChart({ points, loading }: { points: DailyFlowPoint[]; loading: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hasData = points.some((point) => SERIES.some((series) => point[series.key] > 0));

  if (!hasData) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
        {loading ? "Cargando..." : "Sin movimientos en el rango."}
      </div>
    );
  }

  return (
    <LineChart style={{ width: "100%", height: 320 }} responsive data={points} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={16} />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
      <Tooltip
        labelFormatter={(label) => `Día ${dayLabel(String(label))}`}
        formatter={(value) => Number(value).toLocaleString("es-DO")}
        contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }}
      />
      <Legend
        wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
        // Keep the flow order (dispatched → contacted → delivered → returned) instead of the alphabetical default.
        itemSorter={null}
        onMouseEnter={(payload: LegendPayload) => setHovered(String(payload.dataKey ?? ""))}
        onMouseLeave={() => setHovered(null)}
      />
      {SERIES.map((series) => (
        <Line
          key={series.key}
          type="monotone"
          dataKey={series.key}
          name={series.label}
          stroke={series.color}
          strokeWidth={2}
          strokeOpacity={hovered && hovered !== series.key ? 0.25 : 1}
          dot={{ r: 2.5, strokeOpacity: hovered && hovered !== series.key ? 0.25 : 1 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}
