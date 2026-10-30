"use client";

import { useEffect, useRef, useState } from "react";
import { Pie, PieChart, Sector, Tooltip, type PieSectorShapeProps } from "recharts";
import type { StatusSegment } from "@/lib/dashboard/status-segments";

const RADIAN = Math.PI / 180;

// Below this width the leader-line label no longer fits beside the donut.
const COMPACT_WIDTH = 360;

function ActiveSector(props: PieSectorShapeProps & { total: number; compact: boolean }) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, startAngle, endAngle, fill, value, total, compact } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 24) * cos;
  const my = cy + (outerRadius + 24) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 18;
  const textAnchor = cos >= 0 ? "start" : "end";
  const label = (props.payload as StatusSegment | undefined)?.label ?? "";
  const pct = total ? (Number(value) / total) * 100 : 0;

  return (
    <g className="cursor-pointer">
      <text x={cx} y={cy} dy={-4} textAnchor="middle" fill={fill} className="text-sm font-semibold">
        {label}
      </text>
      <text x={cx} y={cy} dy={16} textAnchor="middle" fill="#64748b" className="text-xs">
        {pct.toFixed(1)}%
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />
      {compact ? null : (
        <>
          <path d={`M${sx},${sy}L${mx},${my}L${ex},${my}`} stroke={fill} fill="none" />
          <circle cx={ex} cy={my} r={2} fill={fill} stroke="none" />
          <text x={ex + (cos >= 0 ? 1 : -1) * 8} y={my} textAnchor={textAnchor} fill="#334155" className="text-xs font-semibold">
            {`${Number(value).toLocaleString("es-DO")} tarjetas`}
          </text>
          <text x={ex + (cos >= 0 ? 1 : -1) * 8} y={my} dy={16} textAnchor={textAnchor} fill="#94a3b8" className="text-[11px]">
            {`(${pct.toFixed(1)}%)`}
          </text>
        </>
      )}
    </g>
  );
}

/**
 * Donut of the range statuses grouped like the dashboard cards. Hovering a
 * sector activates it; clicking opens the matching card list.
 */
export function StatusDonutChart({
  segments,
  loading,
  onSelect,
}: {
  segments: StatusSegment[];
  loading: boolean;
  onSelect: (statuses: string[]) => void;
}) {
  // Each datum carries its own fill so active and inactive sectors share the color.
  const visible = segments.filter((segment) => segment.value > 0).map((segment) => ({ ...segment, fill: segment.color }));
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < COMPACT_WIDTH));
    observer.observe(node);
    return () => observer.disconnect();
  }, [total]);

  if (!total) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
        {loading ? "Cargando..." : "Sin tarjetas en el rango."}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      <PieChart
        style={{ width: "100%", height: compact ? 220 : 288 }}
        responsive
        margin={compact ? { top: 8, right: 8, bottom: 8, left: 8 } : { top: 20, right: 70, bottom: 20, left: 70 }}
      >
        <Pie
          data={visible}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius="58%"
          outerRadius="78%"
          paddingAngle={1}
          isAnimationActive={false}
          onClick={(_, index) => onSelect(visible[index]?.statuses ?? [])}
          shape={(props: PieSectorShapeProps) =>
            props.isActive ? (
              <ActiveSector {...props} total={total} compact={compact} />
            ) : (
              <Sector {...props} className="cursor-pointer" />
            )
          }
        />
        <Tooltip content={() => null} defaultIndex={0} />
      </PieChart>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {visible.map((segment) => (
          <button
            key={segment.key}
            type="button"
            onClick={() => onSelect(segment.statuses)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
          >
            <span className="size-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
            {segment.label}
            <span className="font-semibold text-slate-800">{segment.value.toLocaleString("es-DO")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
