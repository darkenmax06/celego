import type { ReactNode } from "react";

export const EMPTY_VALUE = "—";

/** Returns the trimmed value, or an em dash when it is missing. */
export function orDash(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY_VALUE;
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">{children}</dl>;
}

type FieldProps = {
  label: string;
  children: ReactNode;
  /** Spans the whole grid row (multi-line values such as addresses). */
  wide?: boolean;
};

export function Field({ label, children, wide = false }: FieldProps) {
  return (
    <div className={wide ? "col-span-2 md:col-span-3" : "min-w-0"}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}
