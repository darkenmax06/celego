"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { notifyInBrowser } from "@/lib/browser-notifications";

type OperativeTab = "activos" | "urgentes";
type ExportFormat = "xlsx" | "csv" | "pdf";

type PhoneState = {
  num: string;
  principal: boolean;
  funciona: boolean;
};

type OperativeCard = {
  id: string;
  cardId: string | null;
  urgentCaseId: string | null;
  tc: string;
  nombre: string;
  cedula: string;
  provincia: string;
  zona: string;
  status: string;
  urgent: boolean;
  urgentLevel: number | null;
  urgentLabel: string | null;
  urgentIntervalMinutes: number | null;
  urgentNextNotificationAt: string | null;
  urgentLastNotificationAt: string | null;
  remaining: number | null;
  presinto: string | null;
  fechaDespacho: string | null;
  tipoEmision: string | null;
  tipoEntrega: string | null;
  direcciones: string[];
  refs: string[];
  telefonos: PhoneState[];
  comentarioContacto: string;
  contactado: boolean;
  readOnly: boolean;
};

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };
type OperativoResponse = { cards: OperativeCard[]; pagination?: PaginationMeta };
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
  urgentCaseId?: string | null;
  level?: number;
  label?: string;
  intervalMinutes?: number;
  nextNotificationAt?: string;
  notifyNow?: boolean;
  notification?: UrgentNotification | null;
  error?: string;
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "Todos los status" },
  { value: "DESPACHADA", label: "Despachada" },
  { value: "EN_RUTA", label: "En ruta" },
  { value: "ACUSE_RECIBIDO", label: "Acuse recibido" },
  { value: "DEVUELTA_TIENDA", label: "Devuelta a tienda" },
  { value: "ENTREGA_DIGITAL", label: "Entrega digital" },
  { value: "ENTREGADA", label: "Entregada" },
  { value: "RETORNADA", label: "Retornada" },
  { value: "EN_PROCESO", label: "En proceso" },
] as const;

function normalizeStatus(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function statusClasses(value: string) {
  const key = normalizeStatus(value);
  if (key === "RETORNADA" || key === "DEVUELTA_TIENDA") return "text-rose-700 bg-rose-50";
  if (key === "ACUSE_RECIBIDO") return "text-emerald-700 bg-emerald-50";
  if (key === "ENTREGADA" || key === "ENTREGA_DIGITAL") return "text-emerald-700 bg-emerald-50";
  if (key === "EN_RUTA" || key === "EN_PROCESO") return "text-sky-700 bg-sky-50";
  if (key === "DESPACHADA") return "text-indigo-700 bg-indigo-50";
  return "text-slate-700 bg-slate-100";
}

function urgencyClasses(level: number | null) {
  if (level === 5) return "border-red-600 bg-red-100 text-red-900";
  if (level === 4) return "border-rose-500 bg-rose-100 text-rose-900";
  if (level === 3) return "border-orange-500 bg-orange-100 text-orange-900";
  if (level === 2) return "border-amber-500 bg-amber-100 text-amber-900";
  if (level === 1) return "border-yellow-500 bg-yellow-100 text-yellow-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function principalPhone(card: OperativeCard) {
  return card.telefonos.find((item) => item.principal)?.num ?? card.telefonos[0]?.num ?? "-";
}

function chunkAddress(lines: string[]) {
  if (!lines.length) return "-";
  return lines.join(" · ");
}

function normalizePhoneForSave(raw: string) {
  return raw.trim().replace(/[^\d+]/g, "");
}

function normalizePhonesForSave(phones: PhoneState[]) {
  const deduped: PhoneState[] = [];
  const seen = new Set<string>();

  for (const phone of phones) {
    const num = normalizePhoneForSave(phone.num);
    if (!num) continue;

    const key = num.replace(/\D/g, "") || num.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    deduped.push({
      num,
      principal: Boolean(phone.principal),
      funciona: Boolean(phone.funciona),
    });
  }

  if (!deduped.length) return deduped;

  let principalFound = false;
  for (let index = 0; index < deduped.length; index += 1) {
    if (deduped[index].principal && !principalFound) {
      principalFound = true;
      continue;
    }
    deduped[index].principal = false;
  }

  if (!principalFound) {
    deduped[0].principal = true;
  }

  return deduped;
}

function buildContactSignature(input: {
  telefonos: PhoneState[];
  comentario: string;
  contactado: boolean;
}) {
  const phonesSig = normalizePhonesForSave(input.telefonos)
    .map((phone) => `${phone.num}|${phone.principal ? 1 : 0}|${phone.funciona ? 1 : 0}`)
    .join(";");
  return `${phonesSig}::${input.comentario.trim()}::${input.contactado ? 1 : 0}`;
}

function formatUrgentClock(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO");
}

export default function OperativoClient() {
  const [cards, setCards] = useState<OperativeCard[]>([]);
  const [tab, setTab] = useState<OperativeTab>("activos");
  const [provincia, setProvincia] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState(3);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [tabCounts, setTabCounts] = useState<{ activos: number; urgentes: number }>({
    activos: 0,
    urgentes: 0,
  });
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [urgentNotifications, setUrgentNotifications] = useState<UrgentNotification[]>([]);

  async function pullUrgentNotifications() {
    const res = await fetch("/api/operativo/urgencias", { cache: "no-store" });
    const json = await res.json().catch(() => ({ notifications: [] }));
    if (!res.ok) return;
    const notifications = (json.notifications ?? []) as UrgentNotification[];
    if (!notifications.length) return;
    setUrgentNotifications(notifications);
    setMessage(
      `Recordatorios urgentes: ${notifications
        .map((item) => `${item.tc} (${item.label})`)
        .slice(0, 3)
        .join(", ")}`,
    );
  }

  async function loadCards(keepSelectedId?: string) {
    setLoading(true);
    const params = new URLSearchParams({
      tab,
      days: String(days),
      status,
      page: String(page),
      pageSize: String(pagination.pageSize),
    });
    if (provincia !== "ALL") params.set("provincia", provincia);
    if (search.trim()) params.set("q", search.trim());

    const res = await fetch(`/api/operativo/contacto?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as OperativoResponse;
    const nextCards = json.cards ?? [];
    const meta = json.pagination;
    setCards(nextCards);
    if (meta) {
      setPagination(meta);
      setTabCounts((prev) => ({ ...prev, [tab]: meta.total }));
      if (page > meta.totalPages) {
        setPage(meta.totalPages);
      }
    } else {
      setTabCounts((prev) => ({ ...prev, [tab]: nextCards.length }));
    }

    if (keepSelectedId) {
      const keepIndex = nextCards.findIndex((item) => item.id === keepSelectedId);
      setSelectedIndex(keepIndex >= 0 ? keepIndex : null);
    }

    setLoading(false);
  }

  useEffect(() => {
    setPage(1);
    setPagination((prev) => ({ ...prev, page: 1 }));
    setSelectedIndex(null);
  }, [tab, provincia, status, search, days]);

  useEffect(() => {
    void loadCards();
  }, [tab, provincia, status, search, days, page]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await pullUrgentNotifications();
    };
    void run();
    const timer = setInterval(() => {
      void run();
    }, 60_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const provincias = useMemo(() => Array.from(new Set(cards.map((c) => c.provincia))).sort(), [cards]);
  const contactadas = useMemo(() => cards.filter((card) => card.contactado).length, [cards]);
  const current = selectedIndex !== null ? cards[selectedIndex] : undefined;

  async function saveContact(payload: {
    telefonos: PhoneState[];
    comentario: string;
    contactado: boolean;
  }) {
    if (!current || !current.cardId) {
      return "No se puede guardar: tarjeta sin vinculo en la base de datos.";
    }

    const res = await fetch("/api/operativo/contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: current.cardId,
        telefonos: payload.telefonos,
        comentario: payload.comentario,
        contactado: payload.contactado,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return data.error ?? "No se pudo registrar contacto";
    }

    setCards((prev) =>
      prev.map((item) =>
        item.id === current.id
          ? {
              ...item,
              telefonos: normalizePhonesForSave(payload.telefonos),
              comentarioContacto: payload.comentario,
              contactado: payload.contactado,
            }
          : item,
      ),
    );
    return null;
  }

  async function saveUrgency(payload: {
    cardId: string;
    urgent: boolean;
    level?: number;
    resolve?: boolean;
    note?: string;
  }) {
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

    const updatedLevel = typeof json.level === "number" ? Number(json.level) : null;
    setCards((prev) =>
      prev.map((item) =>
        item.cardId === payload.cardId
          ? {
              ...item,
              urgent: Boolean(json.urgent),
              urgentCaseId: (json.urgentCaseId as string | null | undefined) ?? item.urgentCaseId,
              urgentLevel: json.urgent ? updatedLevel : null,
              urgentLabel: json.urgent ? ((json.label as string | undefined) ?? item.urgentLabel) : null,
              urgentIntervalMinutes:
                json.urgent && typeof json.intervalMinutes === "number"
                  ? Number(json.intervalMinutes)
                  : null,
              urgentNextNotificationAt:
                json.urgent && typeof json.nextNotificationAt === "string"
                  ? json.nextNotificationAt
                  : null,
            }
          : item,
        ),
    );

    if (json.notifyNow && json.notification) {
      await notifyInBrowser({
        title: `Urgencia activa: ${json.notification.label}`,
        body: `${json.notification.cliente} - TC ${json.notification.tc}. Primera notificacion enviada.`,
        tag: `urgent-now-${json.notification.urgentCaseId}`,
        requireInteraction: true,
      });
    }

    return null;
  }

  async function exportContacts(format: ExportFormat, provinciaFilter?: string) {
    const params = new URLSearchParams({ type: "contactos", format });
    if (provinciaFilter && provinciaFilter !== "ALL") {
      params.set("provincia", provinciaFilter);
    }

    const res = await fetch(`/api/reportes/export?${params.toString()}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar contactos" }));
      setMessage(json.error ?? "No se pudo exportar contactos");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const scope = provinciaFilter && provinciaFilter !== "ALL" ? `-${provinciaFilter}` : "";
    a.download = `contactos${scope}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Reporte exportado en ${format.toUpperCase()}`);
  }

  async function exportDailyZip(date: string) {
    const res = await fetch(`/api/operativo/contacto/reportes?date=${date}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar ZIP" }));
      setMessage(json.error ?? "No se pudo exportar ZIP");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operativo-${date}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`ZIP operativo generado para ${date}`);
  }

  return (
    <div>
      <PageHeader title="Operativo de llamadas" subtitle={`${pagination.total} tarjetas · ${contactadas} contactadas`} />

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("activos")}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                tab === "activos"
                  ? "border-blue-700 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              Tarjetas Activas ({tab === "activos" ? cards.length : tabCounts.activos})
            </button>
            <button
              onClick={() => setTab("urgentes")}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                tab === "urgentes"
                  ? "border-rose-600 bg-rose-50 text-rose-700"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              Urgentes ({tab === "urgentes" ? cards.length : tabCounts.urgentes})
            </button>
          </div>
          <button
            onClick={() => setShowReport(true)}
            className="rounded-lg bg-[#0f2544] px-3 py-2 text-sm font-semibold text-white"
          >
            Reporte de contactos
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar TC, cedula o nombre..."
            className="min-w-72 flex-1 rounded-xl border border-slate-300 px-3 py-2"
          />
          <select
            value={provincia}
            onChange={(e) => setProvincia(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="ALL">Todas las provincias</option>
            {provincias.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {tab === "activos" ? (
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value={3}>SLA &lt;= 3 dias</option>
              <option value={2}>SLA &lt;= 2 dias</option>
              <option value={1}>SLA &lt;= 1 dia</option>
            </select>
          ) : null}
          <button
            onClick={() => void loadCards()}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            Actualizar
          </button>
        </div>
      </Panel>

      {urgentNotifications.length ? (
        <Panel className="mt-5" title="Notificaciones de urgencia">
          <div className="space-y-2">
            {urgentNotifications.map((item) => (
              <div key={`${item.urgentCaseId}-${item.nextNotificationAt}`} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2">
                <p className="text-sm font-semibold text-rose-900">
                  {item.label} - {item.cliente} ({item.tc})
                </p>
                <p className="text-xs text-rose-800">
                  {item.provincia} - siguiente en {item.intervalMinutes} minutos ({formatUrgentClock(item.nextNotificationAt)})
                </p>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setUrgentNotifications([])}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              Limpiar notificaciones
            </button>
          </div>
        </Panel>
      ) : null}

      <Panel className="mt-5" title={tab === "activos" ? "Cola de clientes" : "Casos urgentes"}>
        <div className="space-y-2">
          {cards.map((card, index) => (
            <div
              key={card.id}
              className={`rounded-xl border px-3 py-3 ${
                card.contactado
                  ? "border-emerald-200 bg-emerald-50/40"
                  : tab === "urgentes" && card.urgentLevel
                    ? urgencyClasses(card.urgentLevel)
                    : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{card.nombre}</p>
                    <span className="font-display text-xs text-slate-500">{card.tc}</span>
                    {card.contactado ? (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Contactado
                      </span>
                    ) : null}
                    {card.urgent && card.urgentLevel ? (
                      <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${urgencyClasses(card.urgentLevel)}`}>
                        {card.urgentLabel ?? `Nivel ${card.urgentLevel}`}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {card.cedula} · {card.provincia}
                    {principalPhone(card) !== "-" ? ` · ${principalPhone(card)}` : ""}
                  </p>
                  {card.comentarioContacto ? (
                    <p className="mt-1 text-xs italic text-slate-600">{`"${card.comentarioContacto}"`}</p>
                  ) : null}
                  {card.urgent && card.urgentNextNotificationAt ? (
                    <p className="mt-1 text-xs font-medium text-rose-700">
                      Proxima alerta: {formatUrgentClock(card.urgentNextNotificationAt)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(card.status)}`}>
                    {statusLabel(card.status)}
                  </span>
                  {card.remaining !== null ? (
                    <span className="text-xs font-semibold text-rose-700">SLA: {card.remaining} dias</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    className="rounded-md bg-[#0f2544] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Contactar
                  </button>
                </div>
              </div>
              {card.readOnly ? (
                <p className="mt-2 text-[11px] text-amber-700">
                  Caso urgente sin tarjeta vinculada. Importa o corrige la tarjeta para guardar contacto.
                </p>
              ) : null}
            </div>
          ))}
          {!cards.length ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {loading ? "Cargando..." : "No hay tarjetas con esos filtros."}
            </p>
          ) : null}
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

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

      {selectedIndex !== null && current ? (
        <ContactModal
          card={current}
          index={selectedIndex}
          total={cards.length}
          onClose={() => setSelectedIndex(null)}
          onPrev={() => setSelectedIndex((prev) => (prev !== null ? Math.max(prev - 1, 0) : prev))}
          onNext={() =>
            setSelectedIndex((prev) => (prev !== null ? Math.min(prev + 1, cards.length - 1) : prev))
          }
          onSave={saveContact}
          onUrgencyChange={saveUrgency}
        />
      ) : null}

      {showReport ? (
        <ContactReportModal
          data={cards}
          onClose={() => setShowReport(false)}
          onExport={exportContacts}
          onExportDailyZip={exportDailyZip}
        />
      ) : null}
    </div>
  );
}

function ContactModal({
  card,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onSave,
  onUrgencyChange,
}: {
  card: OperativeCard;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSave: (payload: { telefonos: PhoneState[]; comentario: string; contactado: boolean }) => Promise<string | null>;
  onUrgencyChange: (payload: {
    cardId: string;
    urgent: boolean;
    level?: number;
    resolve?: boolean;
    note?: string;
  }) => Promise<string | null>;
}) {
  const [telefonos, setTelefonos] = useState<PhoneState[]>([]);
  const [comentario, setComentario] = useState("");
  const [contactado, setContactado] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [savingUrgency, setSavingUrgency] = useState(false);
  const [urgentEnabled, setUrgentEnabled] = useState(false);
  const [urgencyLevel, setUrgencyLevel] = useState(3);
  const [urgencyComment, setUrgencyComment] = useState("");
  const [feedback, setFeedback] = useState("");
  const skipAutoSave = useRef(true);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignature = useRef("");
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    skipAutoSave.current = true;
    const basePhones = card.telefonos.length
      ? card.telefonos.map((phone) => ({ ...phone }))
      : [{ num: "", principal: true, funciona: false }];
    setTelefonos(basePhones);
    setComentario(card.comentarioContacto ?? "");
    setContactado(card.contactado);
    setUrgentEnabled(card.urgent);
    setUrgencyLevel(card.urgentLevel ?? 3);
    setUrgencyComment("");
    lastSavedSignature.current = buildContactSignature({
      telefonos: basePhones,
      comentario: card.comentarioContacto ?? "",
      contactado: card.contactado,
    });
    setNewPhone("");
    setFeedback("");
  }, [card.id, card.comentarioContacto, card.contactado, card.telefonos, card.urgent, card.urgentLevel]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    if (card.readOnly) return;

    const normalizedPhones = normalizePhonesForSave(telefonos);
    const signature = buildContactSignature({
      telefonos: normalizedPhones,
      comentario,
      contactado,
    });
    if (signature === lastSavedSignature.current) {
      return;
    }

    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        setSaving(true);
        const error = await onSaveRef.current({
          telefonos: normalizedPhones,
          comentario,
          contactado,
        });
        if (error) {
          setFeedback(error);
          setSaving(false);
          return;
        }
        lastSavedSignature.current = signature;
        setFeedback("Cambios guardados automaticamente");
        setSaving(false);
      })();
    }, 800);

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [telefonos, comentario, contactado, card.readOnly]);

  function setPrincipal(phoneIndex: number) {
    setTelefonos((prev) =>
      prev.map((phone, indexRow) => ({ ...phone, principal: indexRow === phoneIndex })),
    );
  }

  function toggleFunciona(phoneIndex: number) {
    setTelefonos((prev) =>
      prev.map((phone, indexRow) =>
        indexRow === phoneIndex ? { ...phone, funciona: !phone.funciona } : phone,
      ),
    );
  }

  function removePhone(phoneIndex: number) {
    setTelefonos((prev) => {
      const next = prev.filter((_, indexRow) => indexRow !== phoneIndex);
      if (next.length && !next.some((phone) => phone.principal)) {
        next[0].principal = true;
      }
      return next;
    });
  }

  function addPhone() {
    const value = newPhone.trim();
    if (!value) return;

    setTelefonos((prev) => {
      const normalized = value.replace(/\D/g, "");
      const alreadyExists = prev.some(
        (phone) => (phone.num.replace(/\D/g, "") || phone.num) === (normalized || value),
      );
      if (alreadyExists) return prev;
      return [...prev, { num: value, principal: prev.length === 0, funciona: false }];
    });
    setNewPhone("");
  }

  async function shareContact() {
    if (!card.cardId) {
      setFeedback("No hay tarjeta vinculada para generar imagen");
      return;
    }

    setSharing(true);
    const res = await fetch(`/api/operativo/contacto/share?cardId=${card.cardId}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo generar imagen" }));
      setFeedback(json.error ?? "No se pudo generar imagen");
      setSharing(false);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacto-${card.tc}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback("Imagen generada");
    setSharing(false);
  }

  async function saveUrgencySettings() {
    if (!card.cardId) {
      setFeedback("No hay tarjeta vinculada para actualizar urgencia");
      return;
    }
    setSavingUrgency(true);
    const error = await onUrgencyChange({
      cardId: card.cardId,
      urgent: urgentEnabled,
      level: urgentEnabled ? urgencyLevel : undefined,
      note: urgencyComment.trim() || undefined,
    });
    if (error) {
      setFeedback(error);
      setSavingUrgency(false);
      return;
    }
    setFeedback(urgentEnabled ? "Urgencia actualizada" : "Urgencia desactivada");
    setSavingUrgency(false);
  }

  async function resolveUrgency() {
    if (!card.cardId) {
      setFeedback("No hay tarjeta vinculada para resolver urgencia");
      return;
    }
    setSavingUrgency(true);
    const error = await onUrgencyChange({
      cardId: card.cardId,
      urgent: false,
      resolve: true,
      note: urgencyComment.trim() || undefined,
    });
    if (error) {
      setFeedback(error);
      setSavingUrgency(false);
      return;
    }
    setUrgentEnabled(false);
    setFeedback("Caso urgente marcado como resuelto");
    setSavingUrgency(false);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-xs font-bold text-white">
              {card.nombre
                .split(" ")
                .slice(0, 2)
                .map((chunk) => chunk[0])
                .join("")}
            </div>
            <div>
              <p className="font-display text-lg font-bold text-slate-900">{card.nombre}</p>
              <p className="text-xs text-slate-500">
                {card.tc} · {card.provincia}
              </p>
              <span className={`mt-2 inline-block rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(card.status)}`}>
                {statusLabel(card.status)}
              </span>
              {card.urgent && card.urgentLevel ? (
                <span className={`ml-2 mt-2 inline-block rounded-md border px-2 py-1 text-xs font-semibold ${urgencyClasses(card.urgentLevel)}`}>
                  {card.urgentLabel ?? `Nivel ${card.urgentLevel}`}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
              {index + 1} / {total}
            </span>
            <button
              onClick={onPrev}
              disabled={index === 0}
              className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700 disabled:opacity-40"
            >
              ←
            </button>
            <button
              onClick={onNext}
              disabled={index >= total - 1}
              className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700 disabled:opacity-40"
            >
              →
            </button>
            <button onClick={onClose} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4">
            <InfoCell label="Cedula" value={card.cedula} />
            <InfoCell label="Presinto" value={card.presinto || "-"} />
            <InfoCell
              label="Despacho"
              value={card.fechaDespacho ? new Date(card.fechaDespacho).toLocaleDateString("es-DO") : "-"}
            />
            <InfoCell label="Emision" value={card.tipoEmision || "-"} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Direccion</p>
            <p className="text-sm text-slate-700">{chunkAddress(card.direcciones)}</p>
            {card.refs.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {card.refs.map((item) => (
                  <span key={item} className="rounded-md bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Telefonos</p>
            <div className="space-y-2">
              {telefonos.map((phone, phoneIndex) => (
                <div key={`${phone.num}-${phoneIndex}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <button
                    onClick={() => setPrincipal(phoneIndex)}
                    title="Marcar principal"
                    className={`text-lg leading-none ${phone.principal ? "text-amber-500" : "text-slate-300"}`}
                  >
                    ★
                  </button>
                  <input
                    value={phone.num}
                    onChange={(event) => {
                      const value = event.target.value;
                      setTelefonos((prev) =>
                        prev.map((item, indexRow) =>
                          indexRow === phoneIndex ? { ...item, num: value } : item,
                        ),
                      );
                    }}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  {phone.principal ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      Principal
                    </span>
                  ) : null}
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={phone.funciona}
                      onChange={() => toggleFunciona(phoneIndex)}
                    />
                    {phone.funciona ? "Funciona" : "No funciona"}
                  </label>
                  <button onClick={() => removePhone(phoneIndex)} className="rounded px-1 text-xs text-slate-500 hover:text-rose-600">
                    ✕
                  </button>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <input
                  value={newPhone}
                  onChange={(event) => setNewPhone(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addPhone();
                    }
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Agregar telefono..."
                />
                <button onClick={addPhone} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  + Agregar
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comentario de contacto
            </label>
            <textarea
              value={comentario}
              onChange={(event) => setComentario(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Direccion confirmada, horario, referencia..."
            />
          </div>

          <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${contactado ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <input type="checkbox" checked={contactado} onChange={(event) => setContactado(event.target.checked)} />
            <span className="text-sm text-slate-700">Marcar como contactado</span>
          </label>

          {!card.readOnly ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">Gestion de urgencia</p>
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={urgentEnabled}
                  onChange={(event) => setUrgentEnabled(event.target.checked)}
                />
                Marcar tarjeta como urgente
              </label>

              {urgentEnabled ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nivel de urgencia
                    <select
                      value={urgencyLevel}
                      onChange={(event) => setUrgencyLevel(Number(event.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-700"
                    >
                      <option value={1}>Nivel 1 (Leve) - cada 4.5 horas</option>
                      <option value={2}>Nivel 2 (Moderada) - cada 3.5 horas</option>
                      <option value={3}>Nivel 3 (Alta) - cada 2.5 horas</option>
                      <option value={4}>Nivel 4 (Muy urgente) - cada 1.5 horas</option>
                      <option value={5}>Nivel 5 (Extremadamente urgente) - cada 30 min</option>
                    </select>
                  </label>
                  <div className="text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">Programacion actual</p>
                    <p>Ultima alerta: {formatUrgentClock(card.urgentLastNotificationAt)}</p>
                    <p>Proxima alerta: {formatUrgentClock(card.urgentNextNotificationAt)}</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Comentario de urgencia
                </label>
                <textarea
                  value={urgencyComment}
                  onChange={(event) => setUrgencyComment(event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="Ej: cliente confirma entrega hoy, requiere seguimiento prioritario..."
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveUrgencySettings()}
                  disabled={savingUrgency}
                  className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {savingUrgency ? "Guardando..." : "Guardar urgencia"}
                </button>
                {card.urgent ? (
                  <button
                    type="button"
                    onClick={() => void resolveUrgency()}
                    disabled={savingUrgency}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
                  >
                    Marcar urgente como resuelto
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {card.readOnly ? (
            <p className="text-sm text-amber-700">
              Este caso urgente no tiene tarjeta vinculada. No se puede guardar contacto todavia.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {feedback ? <p className="mr-auto text-sm text-emerald-700">{feedback}</p> : null}
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Cerrar
          </button>
          <button
            onClick={() => void shareContact()}
            disabled={sharing || !card.cardId}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {sharing ? "Generando..." : "Generar imagen"}
          </button>
          {saving ? (
            <span className="text-xs font-semibold text-slate-500">Guardando...</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ContactReportModal({
  data,
  onClose,
  onExport,
  onExportDailyZip,
}: {
  data: OperativeCard[];
  onClose: () => void;
  onExport: (format: ExportFormat, provincia?: string) => Promise<void>;
  onExportDailyZip: (date: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const contactadas = data.filter((item) => item.contactado);
  const pendientes = data.filter((item) => !item.contactado);

  const groupedByProvince = useMemo(() => {
    const grouped = new Map<string, OperativeCard[]>();
    data.forEach((item) => {
      const key = item.provincia || item.zona || "SIN PROVINCIA";
      const rows = grouped.get(key) ?? [];
      rows.push(item);
      grouped.set(key, rows);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function handleExport(format: ExportFormat, provincia?: string) {
    setBusy(true);
    await onExport(format, provincia);
    setBusy(false);
  }

  async function handleDailyZip() {
    setBusy(true);
    await onExportDailyZip(reportDate);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-display text-xl font-bold text-slate-900">Reporte de contactos</h3>
          <button onClick={onClose} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total" value={data.length} color="text-slate-900" />
            <StatCard label="Contactadas" value={contactadas.length} color="text-emerald-700" />
            <StatCard label="Pendientes" value={pendientes.length} color="text-rose-700" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cliente / TC</th>
                  <th className="px-3 py-2">Tel principal</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-center">Contactado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <p className="text-sm font-medium text-slate-800">{item.nombre}</p>
                      <p className="font-display text-xs text-slate-500">{item.tc}</p>
                    </td>
                    <td className="px-3 py-2">{principalPhone(item)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {item.contactado ? (
                        <span className="text-lg font-bold text-emerald-600">✓</span>
                      ) : (
                        <span className="text-base text-slate-300">○</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Generar reporte por provincia</p>
            <div className="space-y-2">
              {groupedByProvince.map(([province, rows]) => (
                <div key={province} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="mr-auto text-sm font-medium text-slate-800">
                    {province} <span className="text-xs text-slate-500">({rows.length} tarjetas)</span>
                  </p>
                  <button
                    onClick={() => void handleExport("xlsx", province)}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  >
                    Excel
                  </button>
                  <button
                    onClick={() => void handleExport("pdf", province)}
                    disabled={busy}
                    className="rounded-lg bg-[#0f2544] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    PDF
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">Reporte general operativo por día</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() => void handleDailyZip()}
                disabled={busy}
                className="rounded-lg bg-[#0f2544] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                Exportar ZIP (JPG por provincia)
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Genera carpetas por provincia y una imagen por cliente para agilizar mensajeros.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Cerrar
          </button>
          <button
            onClick={() => void handleExport("csv")}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            Exportar CSV
          </button>
          <button
            onClick={() => void handleExport("xlsx")}
            disabled={busy}
            className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Exportar completo
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
      <p className={`font-display text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
