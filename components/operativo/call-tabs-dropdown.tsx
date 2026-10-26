"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  buildCallTabsSection,
  operativeTabLabel,
  type OperativeTab,
} from "@/components/operativo/call-tabs-section";

/** Standalone view switcher for call tabs that hide the FilterBar (Extensiones SLA). */
export function CallTabsDropdown({
  tab,
  onTabChange,
}: {
  tab: OperativeTab;
  onTabChange: (next: OperativeTab) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const section = buildCallTabsSection(tab, (next) => {
    setOpen(false);
    onTabChange(next);
  });

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Vista: {operativeTabLabel(tab)}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[90vw] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{section.title}</p>
          {section.render()}
        </div>
      ) : null}
    </div>
  );
}
