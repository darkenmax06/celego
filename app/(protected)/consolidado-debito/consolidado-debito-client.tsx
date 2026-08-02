"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

type Counts = Record<string, number>;
type Issue = {
  severity: "WARNING" | "ROW_ERROR" | "BLOCKING";
  code: string;
  message: string;
  sourceFile: string;
  rowNumber?: number;
  requestNumber?: string;
};
type Preview = {
  runId: string;
  validationToken: string;
  counts: Counts;
  issues: Issue[];
  canApply: boolean;
  duplicateCompletedRunId: string | null;
};
type Run = {
  id: string;
  status: string;
  dispatchDate: string;
  baseFileName: string;
  newCardsFileName: string | null;
  statusFileName: string | null;
  outputFileName: string | null;
  counts: Counts | null;
  createdAt: string;
  createdBy: { name: string; email: string } | null;
};

const today = new Date().toISOString().slice(0, 10);

export default function ConsolidadoDebitoClient() {
  const [base, setBase] = useState<File | null>(null);
  const [newCards, setNewCards] = useState<File | null>(null);
  const [statusFile, setStatusFile] = useState<File | null>(null);
  const [dispatchDate, setDispatchDate] = useState(today);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRuns() {
    const response = await fetch("/api/consolidado-debito", { cache: "no-store" });
    const data = await response.json().catch(() => ({ runs: [] }));
    if (response.ok) setRuns(data.runs ?? []);
  }

  useEffect(() => {
    void loadRuns();
  }, []);

  function choose(setter: (file: File | null) => void) {
    return (event: ChangeEvent<HTMLInputElement>) => setter(event.target.files?.[0] ?? null);
  }

  async function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!base || (!newCards && !statusFile)) {
      setMessage("Carga el consolidado y al menos un archivo de altas o estados.");
      return;
    }
    setLoading(true);
    setMessage("");
    setPreview(null);
    const form = new FormData();
    form.set("consolidatedFile", base);
    form.set("dispatchDate", dispatchDate);
    if (newCards) form.set("newCardsFile", newCards);
    if (statusFile) form.set("statusFile", statusFile);
    const response = await fetch("/api/consolidado-debito/preview", { method: "POST", body: form });
    const data = await response.json().catch(() => ({ error: "No se pudo validar el corte" }));
    if (!response.ok) {
      setMessage(data.error ?? "No se pudo validar el corte");
    } else {
      setPreview(data as Preview);
      setAcknowledge(false);
    }
    setLoading(false);
    void loadRuns();
  }

  async function apply() {
    if (!preview) return;
    setApplying(true);
    setMessage("");
    const response = await fetch("/api/consolidado-debito/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: preview.runId,
        validationToken: preview.validationToken,
        acknowledgeRowErrors: acknowledge,
      }),
    });
    const data = await response.json().catch(() => ({ error: "No se pudo aplicar el corte" }));
    if (!response.ok) {
      setMessage(data.error ?? "No se pudo aplicar el corte");
    } else {
      setMessage(`Corte aplicado: ${data.cardsCreated} altas y ${data.cardsUpdated} gestiones sincronizadas.`);
      setPreview(null);
      void loadRuns();
    }
    setApplying(false);
  }

  const blocking = preview?.counts.blocking ?? 0;
  const rowErrors = preview?.counts.rowErrors ?? 0;

  return (
    <div>
      <PageHeader title="Consolidado débito" subtitle="Valida, concilia y actualiza el corte sin sobrescribir el archivo fuente." />

      <Panel title="1. Preparar corte" subtitle="La fecha de despacho se confirma antes de crear nuevas solicitudes.">
        <form onSubmit={validate} className="grid gap-4 lg:grid-cols-4">
          <UploadField label="Consolidado actual (DATA)" required file={base} onChange={choose(setBase)} />
          <UploadField label="Nuevas tarjetas (opcional)" file={newCards} onChange={choose(setNewCards)} />
          <UploadField label="Estados digitales (opcional)" file={statusFile} onChange={choose(setStatusFile)} />
          <label className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
            Fecha de despacho
            <input type="date" required value={dispatchDate} onChange={(event) => setDispatchDate(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <button disabled={loading} className="mt-4 w-full rounded-lg bg-[#0f2544] px-3 py-2 font-semibold text-white disabled:opacity-60">
              {loading ? "Validando…" : "Generar vista previa"}
            </button>
          </label>
        </form>
        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </Panel>

      {preview ? (
        <Panel className="mt-5" title="2. Conciliación" subtitle="Revisa incidencias antes de aplicar. Un bloqueo impide modificar datos.">
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${blocking ? "border-rose-300 bg-rose-50" : "border-emerald-300 bg-emerald-50"}`}>
            {blocking ? <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-700" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />}
            <div className="text-sm text-slate-700">
              <p className="font-semibold">{blocking ? `${blocking} bloqueo(s) a corregir` : "Corte listo para aplicar"}</p>
              <p>{preview.counts.additionsAdded ?? 0} altas · {preview.counts.statusChanged ?? 0} estados cambiados · {preview.counts.warnings ?? 0} advertencias.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Filas proyectadas" value={preview.counts.projectedRows ?? 0} />
            <Metric label="Errores por fila" value={rowErrors} />
            <Metric label="Sin coincidencia" value={preview.counts.statusUnmatched ?? 0} />
          </div>
          {preview.issues.length ? <IssueList issues={preview.issues} /> : null}
          {rowErrors ? <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} /> Reconozco que las filas con error se omitirán.</label> : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={apply} disabled={!preview.canApply || applying || (rowErrors > 0 && !acknowledge)} className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {applying ? "Aplicando…" : "Aplicar y generar consolidado"}
            </button>
            <a href={`/api/consolidado-debito/${preview.runId}/download?kind=issues`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Descargar incidencias</a>
          </div>
        </Panel>
      ) : null}

      <Panel className="mt-5" title="Historial de cortes">
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="pb-2">Fecha</th><th className="pb-2">Archivo base</th><th className="pb-2">Fuentes</th><th className="pb-2">Estado</th><th className="pb-2"></th></tr></thead><tbody>
          {runs.map((run) => <tr key={run.id} className="border-t border-slate-100"><td className="py-2">{new Date(run.createdAt).toLocaleString("es-DO")}</td><td className="py-2">{run.baseFileName}</td><td className="py-2 text-xs">{[run.newCardsFileName, run.statusFileName].filter(Boolean).join(" · ") || "-"}</td><td className="py-2 font-semibold">{run.status}</td><td className="py-2 text-right">{run.outputFileName ? <a className="text-blue-700 hover:underline" href={`/api/consolidado-debito/${run.id}/download`}>Descargar</a> : "-"}</td></tr>)}
          {!runs.length ? <tr><td colSpan={5} className="py-5 text-slate-500">Aún no hay cortes procesados.</td></tr> : null}
        </tbody></table></div>
      </Panel>
    </div>
  );
}

function UploadField({ label, file, required, onChange }: { label: string; file: File | null; required?: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className="flex min-h-36 cursor-pointer flex-col justify-between rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 hover:border-blue-500"><span className="font-semibold text-slate-800">{label}{required ? " *" : ""}</span><FileSpreadsheet className="h-7 w-7 text-blue-700" /><span className="break-all text-xs">{file?.name ?? "Seleccionar .xlsx"}</span><input required={required} className="hidden" type="file" accept=".xlsx" onChange={onChange} /></label>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-[#0f2544]">{value}</p></div>;
}

function IssueList({ issues }: { issues: Issue[] }) {
  return <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-2">Nivel</th><th className="p-2">Solicitud</th><th className="p-2">Detalle</th></tr></thead><tbody>{issues.slice(0, 200).map((issue, index) => <tr key={`${issue.code}-${index}`} className="border-t border-slate-100"><td className="p-2 font-semibold">{issue.severity}</td><td className="p-2">{issue.requestNumber ?? "-"}</td><td className="p-2">{issue.message}</td></tr>)}</tbody></table></div>;
}
