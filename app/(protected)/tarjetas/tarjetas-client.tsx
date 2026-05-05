"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { CardStatus } from "@prisma/client";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

type CardRow = {
  id: string;
  tc: string;
  provincia: string;
  zona: string;
  isRemote: boolean;
  status: string;
  urgent: boolean;
  dispatchDate: string | null;
  customer: { nombre: string; cedula: string };
  currentMessenger?: { nombre: string } | null;
};

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type CardsResponse = { cards: CardRow[]; pagination?: PaginationMeta };

const statuses: CardStatus[] = [
  CardStatus.DESPACHADA,
  CardStatus.ENVIADA_INTERIOR,
  CardStatus.EN_RUTA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.ENTREGADA,
  CardStatus.RETORNADA,
];

export default function TarjetasClient() {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [provincia, setProvincia] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);

  async function fetchCards(pageArg = page) {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "ALL") params.set("status", status);
    if (provincia !== "ALL") params.set("provincia", provincia);
    params.set("page", String(pageArg));
    params.set("pageSize", String(pagination.pageSize));

    const res = await fetch(`/api/tarjetas?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as CardsResponse;
    setCards(json.cards ?? []);
    if (json.pagination) {
      setPagination(json.pagination);
      if (pageArg > json.pagination.totalPages) {
        setPage(json.pagination.totalPages);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void fetchCards(page);
  }, [page]);

  const provincias = useMemo(() => {
    return Array.from(new Set(cards.map((card) => card.provincia))).sort();
  }, [cards]);

  async function uploadFile(endpoint: string, file: File) {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(endpoint, {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Error en importacion");
      return;
    }

    setMessage(`Importacion completada (${data.imported ?? data.parsedRows ?? 0} filas)`);
    await fetchCards();
  }

  function onUpload(endpoint: string) {
    return async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await uploadFile(endpoint, file);
      event.target.value = "";
    };
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    void fetchCards(1);
  }

  return (
    <div>
      <PageHeader title="Tarjetas" subtitle="Importacion y consulta de tarjetas" />

      <Panel>
        <form className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]" onSubmit={onSearch}>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar por TC, cedula o nombre"
            className="rounded-xl border border-slate-300 px-3 py-2"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2">
            <option value="ALL">Todos los estados</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={provincia} onChange={(event) => setProvincia(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2">
            <option value="ALL">Todas las provincias</option>
            {provincias.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white">
            Filtrar
          </button>
          <button type="button" onClick={() => void fetchCards()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
            Refrescar
          </button>
        </form>

        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel className="mt-5" title="Importaciones" subtitle="Archivos Excel oficiales del proceso">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
          <Uploader label="Importar Data Diaria" onChange={onUpload("/api/tarjetas/importar")} />
          <Uploader label="Importar Urgentes" onChange={onUpload("/api/importaciones/urgentes")} />
        </div>
      </Panel>

      <Panel className="mt-5" title="Listado de tarjetas">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">TC</th>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Cedula</th>
                <th className="pb-2">Provincia</th>
                <th className="pb-2">Zona</th>
                <th className="pb-2">Remota</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2">Urgente</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id} className="border-t border-slate-100">
                  <td
                    className="cursor-pointer py-2 font-medium text-blue-700 hover:underline"
                    onClick={() => setSelectedCardId(card.id)}
                  >
                    {card.tc}
                  </td>
                  <td
                    className="cursor-pointer py-2 hover:underline"
                    onClick={() => setSelectedCardId(card.id)}
                  >
                    {card.customer.nombre}
                  </td>
                  <td className="py-2">{card.customer.cedula}</td>
                  <td className="py-2">{card.provincia}</td>
                  <td className="py-2">{card.zona}</td>
                  <td className="py-2">{card.isRemote ? "SI" : "NO"}</td>
                  <td className="py-2">
                    <StatusBadge value={card.status} />
                  </td>
                  <td className="py-2">{card.urgent ? "SI" : "NO"}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedCardId(card.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {!cards.length ? (
                <tr>
                  <td colSpan={9} className="py-4 text-sm text-slate-500">
                    {loading ? "Cargando..." : "No hay resultados"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span>
            Pagina {pagination.page} de {pagination.totalPages} · {pagination.total} registros
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
              disabled={page >= pagination.totalPages}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </Panel>

      {selectedCardId ? (
        <CardDetailModal
          cardId={selectedCardId}
          onClose={() => setSelectedCardId(null)}
          onUpdated={() => {
            void fetchCards();
          }}
        />
      ) : null}
    </div>
  );
}

function Uploader({ label, onChange }: { label: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm font-medium text-slate-600 transition hover:border-slate-500 hover:text-slate-900">
      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={onChange} />
      {label}
    </label>
  );
}
