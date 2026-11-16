"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

type Props = {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** Bordered card with a toggle header; content is unmounted while collapsed. */
export function CollapsibleSection({ title, icon: Icon, open, onToggle, children }: Props) {
  const contentId = useId();
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h4>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm font-semibold text-slate-800">{title}</span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </h4>
      <div id={contentId} hidden={!open} className="border-t border-slate-100 px-4 py-4">
        {open ? children : null}
      </div>
    </section>
  );
}
