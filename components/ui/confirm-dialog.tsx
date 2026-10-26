"use client";

import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel on open (a stray Enter must not confirm) and hand focus back on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  function trapTab(event: KeyboardEvent) {
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onCancel();
          if (event.key === "Tab") trapTab(event);
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              tone === "danger" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600",
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 id={titleId} className="font-display text-base font-semibold text-slate-900">
              {title}
            </h2>
            <p id={messageId} className="mt-1 text-sm text-slate-600">
              {message}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60",
              tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-900 hover:bg-slate-800",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
