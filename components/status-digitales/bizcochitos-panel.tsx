"use client";

import { CakeSlice, Download, FileClock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/ui/panel";

type Batch = {
  id: string;
  code: string;
  generatedAt: string;
  itemCount: number;
  originalFileName: string;
  originalSha256: string;
  generatedBy: { id: string; name: string; email: string } | null;
};

type BizcochitoData = {
  pendingCount: number;
  latest: Pick<Batch, "id" | "code" | "generatedAt" | "itemCount"> | null;
  batches: Batch[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function responseFileName(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallback;
}

export function BizcochitosPanel() {
  const [data, setData] = useState<BizcochitoData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyBatch, setBusyBatch] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/status-digitales/bizcochitos?page=${page}`, {
      cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      setError(json?.error ?? "No se pudo cargar el historico de Bizcochitos");
      setLoading(false);
      return;
    }
    setData(json as BizcochitoData);
    setError("");
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function generate() {
    if (!data?.pendingCount || generating) return;
    if (
      !window.confirm(
        `Se generara un Bizcochito con ${data.pendingCount} entrega(s) digital(es) pendiente(s). ¿Continuar?`,
      )
    ) {
      return;
    }

    setGenerating(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/status-digitales/bizcochitos", { method: "POST" });
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      setError(json?.error ?? "No se pudo generar el Bizcochito");
      setGenerating(false);
      return;
    }
    const code = response.headers.get("x-bizcochito-code") ?? "Bizcochito";
    downloadBlob(
      await response.blob(),
      responseFileName(response, `${code}.xlsx`),
    );
    setMessage(`${code} generado y descargado correctamente`);
    setGenerating(false);
    setPage(1);
    await loadData();
  }

  async function download(batch: Batch, mode: "original" | "regenerar") {
    setBusyBatch(`${batch.id}:${mode}`);
    setError("");
    const response = await fetch(
      `/api/status-digitales/bizcochitos/${batch.id}/${mode}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      setError(json?.error ?? "No se pudo descargar el archivo");
      setBusyBatch(null);
      return;
    }
    downloadBlob(
      await response.blob(),
      responseFileName(
        response,
        mode === "original"
          ? batch.originalFileName
          : `${batch.code}-datos-actuales.xlsx`,
      ),
    );
    setBusyBatch(null);
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(146,64,14,0.06)]">
        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-800">
              <CakeSlice aria-hidden="true" size={26} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
                Ciclo bancario
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <p className="font-display text-4xl font-bold text-slate-950">
                  {loading ? "—" : (data?.pendingCount ?? 0)}
                </p>
                <p className="text-sm text-slate-600">entregas digitales pendientes</p>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {data?.latest
                  ? `Último lote: ${data.latest.code} · ${data.latest.itemCount} tarjetas`
                  : "Aún no se ha generado ningún Bizcochito."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || loading || !data?.pendingCount}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f2544] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#17355d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CakeSlice aria-hidden="true" size={18} />
            {generating ? "Generando..." : "Generar bizcochito"}
          </button>
        </div>
        <div className="border-t border-amber-100 bg-amber-50/70 px-5 py-3 text-xs text-amber-900">
          Incluye todas las entregas digitales pendientes y marca únicamente el ciclo exportado.
        </div>
      </section>

      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <Panel
        title="Histórico de Bizcochitos"
        subtitle="El original permanece inmutable; la regeneración utiliza los datos vigentes."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-3">Código</th>
                <th className="pb-3">Generado</th>
                <th className="pb-3">Tarjetas</th>
                <th className="pb-3">Usuario</th>
                <th className="pb-3 text-right">Archivos</th>
              </tr>
            </thead>
            <tbody>
              {(data?.batches ?? []).map((batch) => (
                <tr key={batch.id} className="border-t border-slate-100">
                  <td className="py-3 font-semibold text-[#0f2544]">{batch.code}</td>
                  <td className="py-3 text-slate-600">
                    {new Date(batch.generatedAt).toLocaleString("es-DO")}
                  </td>
                  <td className="py-3 tabular-nums">{batch.itemCount}</td>
                  <td className="py-3 text-slate-600">
                    {batch.generatedBy?.name ?? "Usuario histórico"}
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void download(batch, "original")}
                        disabled={busyBatch !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Download size={15} />
                        Original
                      </button>
                      <button
                        type="button"
                        onClick={() => void download(batch, "regenerar")}
                        disabled={busyBatch !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        <RefreshCw size={15} />
                        Datos actuales
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !data?.batches.length ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    <FileClock className="mx-auto mb-2" size={28} strokeWidth={1.5} />
                    No hay Bizcochitos generados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {(data?.pagination.totalPages ?? 1) > 1 ? (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              Página {data?.pagination.page} de {data?.pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= (data?.pagination.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
