"use client";

import { PHONE_CALL_STATE_LABELS, PHONE_CALL_STATES } from "@/lib/contact-call-shared";
import { cn } from "@/lib/utils";

/** Per-phone call outcome picker (labels from `lib/contact-call-shared.ts`). */
export function PhoneEstadoSelect({
  value,
  onChange,
  label,
  invalid = false,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Accessible name, e.g. "Estado del número 8095551234". */
  label: string;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "w-full rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden",
        invalid ? "border-rose-400 ring-1 ring-rose-300" : "border-slate-300",
        className,
      )}
    >
      <option value="">Estado...</option>
      {PHONE_CALL_STATES.map((state) => (
        <option key={state} value={state}>
          {PHONE_CALL_STATE_LABELS[state]}
        </option>
      ))}
    </select>
  );
}
