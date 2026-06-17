import { WorkflowDraftStatus } from "@/lib/use-workflow-draft";

const LABELS: Record<WorkflowDraftStatus, string> = {
  loading: "Buscando progreso guardado...",
  idle: "Progreso listo para autoguardado",
  restored: "Progreso recuperado",
  saving: "Guardando progreso...",
  saved: "Progreso guardado",
  conflict: "Conflicto con otra pestaña o equipo",
  error: "No se pudo guardar el progreso",
};

export function WorkflowStatusBar({
  status,
  updatedAt,
  onUseRemote,
  onOverwrite,
}: {
  status: WorkflowDraftStatus;
  updatedAt?: string | null;
  onUseRemote?: () => void;
  onOverwrite?: () => void;
}) {
  const tone =
    status === "error" || status === "conflict"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : status === "saved" || status === "restored"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-slate-200 bg-white text-slate-600";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 flex min-h-10 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${tone}`}
    >
      <span className="font-semibold">{LABELS[status]}</span>
      {updatedAt ? (
        <span className="text-current/70">
          {new Date(updatedAt).toLocaleString("es-DO")}
        </span>
      ) : null}
      {status === "conflict" ? (
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onUseRemote}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold"
          >
            Usar progreso guardado
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            className="rounded-lg bg-amber-800 px-3 py-1.5 font-semibold text-white"
          >
            Conservar este progreso
          </button>
        </div>
      ) : null}
    </div>
  );
}
