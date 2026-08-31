"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { ContratoPendienteWizard } from "@/components/cards/contrato-pendiente-wizard";

type PendingCard = {
  id: string;
  tc: string;
  status: "ENTREGA_DIGITAL_SIN_CONTRATO" | "ENTREGA_SIN_CONTRATO";
  provincia: string;
  contractImageAt: string | null;
  customer: {
    nombre: string;
    cedula: string;
    telefonosRaw: string | null;
  };
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos los estados" },
  { value: "ENTREGA_DIGITAL_SIN_CONTRATO", label: "Entrega digital sin contrato" },
  { value: "ENTREGA_SIN_CONTRATO", label: "Entrega sin contrato" },
];

export default function ContratosPendientesClient() {
  const [cards, setCards] = useState<PendingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<PendingCard | null>(null);

  async function loadCards() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);

    const response = await fetch(`/api/contratos-pendientes?${params.toString()}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({ cards: [] }));
    setCards(Array.isArray(json.cards) ? json.cards : []);
    setLoading(false);
  }

  useEffect(() => {
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filteredCards = useMemo(() => cards, [cards]);

  return (
    <div>
      <PageHeader
        title="Contratos pendientes"
        subtitle="Tarjetas con contrato requerido que quedaron pendientes de imagen de contrato o de confirmación de entrega."
      />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadCards();
            }}
            placeholder="Buscar por TC, cliente o cédula"
            className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={loadCards}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((prev) => !prev)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Filtros {filtersOpen ? "▲" : "▼"}
          </button>
        </div>

        {filtersOpen ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </Panel>

      <Panel title={`Pendientes (${filteredCards.length})`}>
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : filteredCards.length === 0 ? (
          <p className="text-sm text-slate-500">No hay tarjetas pendientes de contrato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">TC</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Cédula</th>
                  <th className="py-2 pr-4">Teléfonos</th>
                  <th className="py-2 pr-4">Provincia</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((card) => (
                  <tr key={card.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">{card.tc}</td>
                    <td className="py-2 pr-4">{card.customer.nombre}</td>
                    <td className="py-2 pr-4">{card.customer.cedula}</td>
                    <td className="py-2 pr-4">{card.customer.telefonosRaw ?? "-"}</td>
                    <td className="py-2 pr-4">{card.provincia}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={card.status} />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedCard(card)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Resolver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selectedCard ? (
        <ContratoPendienteWizard
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onResolved={() => {
            setSelectedCard(null);
            loadCards();
          }}
        />
      ) : null}
    </div>
  );
}
