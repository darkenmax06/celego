"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

type ParsedImageRow = {
  fileName: string;
  identifier: string;
  isRemote: boolean;
};

type ProcessedRow = {
  fileName: string;
  identifier: string;
  found: boolean;
  cardId?: string;
  statusBefore?: string;
  statusAfter?: string;
  remoteBefore?: boolean;
  remoteAfter?: boolean;
  action: string;
};

type Summary = {
  filesReceived: number;
  uniqueIdentifiers: number;
  cardsMatched: number;
  cardsNotFound: number;
  updatedToDigital: number;
  keptDelivered: number;
  markedRemote: number;
  unchanged: number;
};

function parseImageFileName(fileName: string) {
  const noExt = fileName.replace(/\.[^/.]+$/, "").trim();
  const hasRemoteTag = /\(\s*zr\s*\)/i.test(noExt);
  const identifier = noExt
    .replace(/\(\s*zr\s*\)/gi, "")
    .replace(/\(\s*adicional(?:\s+\d+)?\s*\)\s*$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  return { identifier, hasRemoteTag };
}

export default function StatusDigitalesClient() {
  const [images, setImages] = useState<ParsedImageRow[]>([]);
  const [rows, setRows] = useState<ProcessedRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const notFound = useMemo(() => rows.filter((row) => !row.found).length, [rows]);

  function onSelectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const parsed = files
      .map((file) => {
        const parsedName = parseImageFileName(file.name);
        return {
          fileName: file.name,
          identifier: parsedName.identifier,
          isRemote: parsedName.hasRemoteTag,
        };
      })
      .filter((item) => item.identifier);

    setImages(parsed);
    setRows([]);
    setSummary(null);
    setMessage(parsed.length ? `${parsed.length} imagen(es) listas para procesar` : "No se detectaron nombres validos");
  }

  async function processImages() {
    if (!images.length) {
      setMessage("Selecciona imagenes primero");
      return;
    }

    setProcessing(true);
    setMessage("");
    const res = await fetch("/api/status-digitales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: images }),
    });
    const json = await res.json().catch(() => ({ error: "No se pudo procesar status digitales" }));

    if (!res.ok) {
      setMessage(json.error ?? "No se pudo procesar status digitales");
      setProcessing(false);
      return;
    }

    setRows((json.rows ?? []) as ProcessedRow[]);
    setSummary((json.summary ?? null) as Summary | null);
    setMessage("Status digitales procesados");
    setProcessing(false);
  }

  return (
    <div>
      <PageHeader
        title="Entrega digital por imagenes"
        subtitle="Sube imagenes, detecta numero de tarjeta por nombre de archivo y aplica ENTREGA DIGITAL"
      />

      <Panel>
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Seleccionar imagenes</p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onSelectFiles}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">
            Reglas: <code>(ZR)</code> marca zona remota. <code>(ADICIONAL)</code> y <code>(ADICIONAL 2)</code> al final
            seleccionan tarjetas adicionales por nombre/cédula y fecha de despacho.
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void processImages()}
            disabled={processing || !images.length}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {processing ? "Procesando..." : `Procesar (${images.length})`}
          </button>
          <button
            type="button"
            onClick={() => {
              setImages([]);
              setRows([]);
              setSummary(null);
              setMessage("");
            }}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            Limpiar
          </button>
        </div>

        {summary ? (
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Archivos" value={summary.filesReceived} />
            <Stat label="Coinciden" value={summary.cardsMatched} />
            <Stat label="No encontradas" value={summary.cardsNotFound} />
            <Stat label="A digital" value={summary.updatedToDigital} />
            <Stat label="Entregadas intactas" value={summary.keptDelivered} />
            <Stat label="Marcadas ZR" value={summary.markedRemote} />
            <Stat label="Sin cambios" value={summary.unchanged} />
            <Stat label="Ids unicos" value={summary.uniqueIdentifiers} />
          </div>
        ) : null}

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel className="mt-5" title={`Resultado por archivo${rows.length ? ` (${rows.length})` : ""}`}>
        <div className="mb-3 text-xs text-slate-500">
          No encontradas: {notFound}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Archivo</th>
                <th className="pb-2">Tarjeta</th>
                <th className="pb-2">Estado anterior</th>
                <th className="pb-2">Estado nuevo</th>
                <th className="pb-2">Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.fileName}-${index}`} className="border-t border-slate-100">
                  <td className="py-2">{row.fileName}</td>
                  <td className="py-2 font-medium text-blue-700">{row.identifier}</td>
                  <td className="py-2">
                    {row.found && row.statusBefore ? <StatusBadge value={row.statusBefore} /> : "-"}
                  </td>
                  <td className="py-2">
                    {row.found && row.statusAfter ? <StatusBadge value={row.statusAfter} /> : "-"}
                  </td>
                  <td className="py-2">{row.action}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                    Aun no hay resultados para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}
