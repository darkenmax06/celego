"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { CardStatus } from "@prisma/client";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { notifyInBrowser } from "@/lib/browser-notifications";

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
  activeUrgentCase: {
    id: string;
    level: number;
    nextNotificationAt: string | null;
    lastNotifiedAt: string | null;
  } | null;
};

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type CardsResponse = { cards: CardRow[]; pagination?: PaginationMeta };

type UrgencyPayload = {
  cardId: string;
  urgent: boolean;
  level?: number;
  resolve?: boolean;
  note?: string;
};

type UrgentNotification = {
  urgentCaseId: string;
  cardId: string;
  tc: string;
  cliente: string;
  cedula: string;
  provincia: string;
  level: number;
  label: string;
  intervalMinutes: number;
  nextNotificationAt: string;
};

type UrgencyMutationResponse = {
  urgent?: boolean;
  label?: string;
  notifyNow?: boolean;
  notification?: UrgentNotification | null;
  error?: string;
};

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

function urgencyClasses(level: number | null) {
  if (level === 5) return "border-red-600 bg-red-100 text-red-900";
  if (level === 4) return "border-rose-500 bg-rose-100 text-rose-900";
  if (level === 3) return "border-orange-500 bg-orange-100 text-orange-900";
  if (level === 2) return "border-amber-500 bg-amber-100 text-amber-900";
  if (level === 1) return "border-yellow-500 bg-yellow-100 text-yellow-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function urgencyLabel(level: number) {
  if (level === 5) return "Nivel 5";
  if (level === 4) return "Nivel 4";
  if (level === 3) return "Nivel 3";
  if (level === 2) return "Nivel 2";
  return "Nivel 1";
}

function formatUrgentClock(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO");
}

export default function TarjetasClient() {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [provincia, setProvincia] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [urgencyTarget, setUrgencyTarget] = useState<CardRow | null>(null);
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

  async function pullImmediateUrgentNotifications() {
    const res = await fetch("/api/operativo/urgencias", { cache: "no-store" });
    const json = await res.json().catch(() => ({ notifications: [] as UrgentNotification[] }));
    if (!res.ok) return 0;
    const notifications = (json.notifications ?? []) as UrgentNotification[];
    for (const item of notifications) {
      await notifyInBrowser({
        title: `Urgencia activa: ${item.label}`,
        body: `${item.cliente} - TC ${item.tc} (${item.provincia})`,
        tag: `urgent-import-${item.urgentCaseId}`,
        requireInteraction: true,
      });
    }
    return notifications.length;
  }

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

    const importedCount = data.imported ?? data.parsedRows ?? 0;
    let summaryMessage = `Importacion completada (${importedCount} filas)`;
    if (endpoint === "/api/importaciones/urgentes") {
      const emitted = await pullImmediateUrgentNotifications();
      if (emitted > 0) {
        summaryMessage += `. Notificaciones inmediatas enviadas: ${emitted}`;
      }
    }
    setMessage(summaryMessage);
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

  async function saveUrgency(payload: UrgencyPayload) {
    const res = await fetch("/api/operativo/urgencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res
      .json()
      .catch(() => ({ error: "No se pudo actualizar urgencia" }))) as UrgencyMutationResponse;
    if (!res.ok) {
      return json.error ?? "No se pudo actualizar urgencia";
    }

    if (json.urgent) {
      const label = typeof json.label === "string" ? json.label : "urgencia";
      setMessage(`Urgencia actualizada: ${label}`);
    } else {
      setMessage("Caso urgente resuelto");
    }

    if (json.notifyNow && json.notification) {
      await notifyInBrowser({
        title: `Urgencia activa: ${json.notification.label}`,
        body: `${json.notification.cliente} - TC ${json.notification.tc}. Primera notificacion enviada.`,
        tag: `urgent-now-${json.notification.urgentCaseId}`,
        requireInteraction: true,
      });
    }

    await fetchCards(page);
    return null;
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
                <th className="pb-2">Nivel</th>
                <th className="pb-2">Proxima alerta</th>
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
                  <td className="py-2">
                    {card.activeUrgentCase ? (
                      <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${urgencyClasses(card.activeUrgentCase.level)}`}>
                        {urgencyLabel(card.activeUrgentCase.level)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 text-xs">{formatUrgentClock(card.activeUrgentCase?.nextNotificationAt ?? null)}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setUrgencyTarget(card)}
                        className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                      >
                        Urgencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCardId(card.id)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        Ver
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!cards.length ? (
                <tr>
                  <td colSpan={11} className="py-4 text-sm text-slate-500">
                    {loading ? "Cargando..." : "No hay resultados"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span>
            Pagina {pagination.page} de {pagination.totalPages} - {pagination.total} registros
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

      {urgencyTarget ? (
        <UrgencyModal
          card={urgencyTarget}
          onClose={() => setUrgencyTarget(null)}
          onSubmit={saveUrgency}
        />
      ) : null}
    </div>
  );
}

function UrgencyModal({
  card,
  onClose,
  onSubmit,
}: {
  card: CardRow;
  onClose: () => void;
  onSubmit: (payload: UrgencyPayload) => Promise<string | null>;
}) {
  const [enabled, setEnabled] = useState(card.urgent);
  const [level, setLevel] = useState(card.activeUrgentCase?.level ?? 3);
  const [saving, setSaving] = useState(false);
  const [urgencyComment, setUrgencyComment] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setEnabled(card.urgent);
    setLevel(card.activeUrgentCase?.level ?? 3);
    setUrgencyComment("");
    setFeedback("");
  }, [card.id, card.urgent, card.activeUrgentCase?.level]);

  async function save() {
    setSaving(true);
    setFeedback("");

    const error = await onSubmit({
      cardId: card.id,
      urgent: enabled,
      level: enabled ? level : undefined,
      note: urgencyComment.trim() || undefined,
    });

    if (error) {
      setFeedback(error);
      setSaving(false);
      return;
    }

    setSaving(false);
    onClose();
  }

  async function resolve() {
    setSaving(true);
    setFeedback("");
    const error = await onSubmit({
      cardId: card.id,
      urgent: false,
      resolve: true,
      note: urgencyComment.trim() || undefined,
    });
    if (error) {
      setFeedback(error);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-rose-700">Gestion de urgencia</p>
            <h3 className="text-lg font-bold text-slate-900">
              {card.customer.nombre} - {card.tc}
            </h3>
            <p className="text-xs text-slate-500">{card.customer.cedula}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-3">
          <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Marcar tarjeta como urgente
          </label>

          {enabled ? (
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nivel de urgencia
              <select
                value={level}
                onChange={(event) => setLevel(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-700"
              >
                <option value={1}>Nivel 1 (Leve) - cada 4.5 horas</option>
                <option value={2}>Nivel 2 (Moderada) - cada 3.5 horas</option>
                <option value={3}>Nivel 3 (Alta) - cada 2.5 horas</option>
                <option value={4}>Nivel 4 (Muy urgente) - cada 1.5 horas</option>
                <option value={5}>Nivel 5 (Extremadamente urgente) - cada 30 min</option>
              </select>
            </label>
          ) : null}

          <div className="mt-3 text-xs text-slate-600">
            <p>Ultima alerta: {formatUrgentClock(card.activeUrgentCase?.lastNotifiedAt ?? null)}</p>
            <p>Proxima alerta: {formatUrgentClock(card.activeUrgentCase?.nextNotificationAt ?? null)}</p>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comentario de urgencia
            </label>
            <textarea
              value={urgencyComment}
              onChange={(event) => setUrgencyComment(event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Ej: confirmar entrega hoy, cliente requiere prioridad..."
            />
          </div>
        </div>

        {feedback ? <p className="mt-3 text-sm text-rose-700">{feedback}</p> : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {card.urgent ? (
            <button
              type="button"
              onClick={() => void resolve()}
              disabled={saving}
              className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
            >
              Marcar como resuelto
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar urgencia"}
          </button>
        </div>
      </div>
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
