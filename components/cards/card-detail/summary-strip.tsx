import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function SummaryStrip({ children }: { children: ReactNode }) {
  return (
    <div role="list" aria-label="Resumen de la tarjeta" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {children}
    </div>
  );
}

type TileProps = {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
  /** Secondary line under the main value (small, muted). */
  hint?: ReactNode;
  /** Optional badge aligned with the tile label. */
  badge?: ReactNode;
};

export function SummaryTile({ label, icon: Icon, children, hint, badge }: TileProps) {
  return (
    <div role="listitem" aria-label={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </span>
        {badge}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{children}</div>
      {hint ? <div className="mt-0.5 truncate text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
