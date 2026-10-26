import type { ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Phone,
  RotateCcw,
  Send,
} from "lucide-react";
import type { FilterMenuSection } from "@/components/filters/filter-bar";

export type OperativeTab =
  | "activos"
  | "contactadas"
  | "no-contactadas"
  | "urgentes"
  | "traslados"
  | "retorno"
  | "extensiones-sla";

export const DEFAULT_OPERATIVE_TAB: OperativeTab = "activos";

type OperativeTabMeta = {
  id: OperativeTab;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** Classes applied while the tab is selected. */
  activeClass: string;
};

export const OPERATIVE_TABS: readonly OperativeTabMeta[] = [
  { id: "activos", label: "Tarjetas Activas (Por llamar)", Icon: Phone, activeClass: "border-blue-700 bg-blue-50 text-blue-700" },
  { id: "contactadas", label: "Contactadas", Icon: CheckCircle2, activeClass: "border-emerald-600 bg-emerald-50 text-emerald-700" },
  { id: "no-contactadas", label: "No Contactadas (Intentos)", Icon: Clock, activeClass: "border-amber-500 bg-amber-100 text-amber-800" },
  { id: "urgentes", label: "Casos Urgentes", Icon: AlertTriangle, activeClass: "border-rose-600 bg-rose-50 text-rose-700" },
  { id: "traslados", label: "Traslados (Cambio Prov.)", Icon: Send, activeClass: "border-indigo-600 bg-indigo-50 text-indigo-700" },
  { id: "retorno", label: "Solicitudes de Retorno", Icon: RotateCcw, activeClass: "border-red-600 bg-red-50 text-red-700" },
  { id: "extensiones-sla", label: "Extensiones SLA (Banco)", Icon: FileSpreadsheet, activeClass: "border-[#0f2544] bg-[#0f2544] text-white" },
];

export function operativeTabLabel(tab: OperativeTab): string {
  return OPERATIVE_TABS.find((t) => t.id === tab)?.label ?? tab;
}

/** The view buttons rendered inside the filter menu (and the standalone dropdown). */
export function CallTabsList({
  tab,
  onSelect,
}: {
  tab: OperativeTab;
  onSelect: (next: OperativeTab) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {OPERATIVE_TABS.map(({ id, label, Icon, activeClass }) => {
        const selected = tab === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              selected ? `${activeClass} shadow-2xs` : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** FilterBar section for the call views. The chip appears only off the default tab. */
export function buildCallTabsSection(
  tab: OperativeTab,
  setTab: (next: OperativeTab) => void,
): FilterMenuSection {
  return {
    id: "vista",
    title: "Vista",
    render: () => <CallTabsList tab={tab} onSelect={setTab} />,
    chips:
      tab === DEFAULT_OPERATIVE_TAB
        ? []
        : [
            {
              key: "vista",
              label: `Vista: ${operativeTabLabel(tab)}`,
              onRemove: () => setTab(DEFAULT_OPERATIVE_TAB),
            },
          ],
  };
}
