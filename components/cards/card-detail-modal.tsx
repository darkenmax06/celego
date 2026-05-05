"use client";

import { useEffect, useMemo, useState } from "react";
import { CardStatus } from "@prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";

type ReturnReason = { id: string; nombre: string; active: boolean };

type CardDetail = {
  id: string;
  tc: string;
  externalReference: string | null;
  zona: string;
  provincia: string;
  isRemote: boolean;
  dispatchDate: string | null;
  deliveryType: string | null;
  emissionType: string | null;
  supplier: string | null;
  contractType: string | null;
  status: string;
  urgent: boolean;
  slaDueDate: string | null;
  returnReason: string | null;
  metadata: unknown;
  customer: {
    nombre: string;
    cedula: string;
    direccionRaw: string | null;
    telefonosRaw: string | null;
  };
  currentMessenger: { nombre: string } | null;
  logs: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
    byUser: { name: string } | null;
  }>;
  contacts: Array<{
    id: string;
    telefonosUsados: string | null;
    comentario: string | null;
    contactado: boolean;
    createdAt: string;
    user: { name: string } | null;
  }>;
};

type Props = {
  cardId: string;
  onClose: () => void;
  onUpdated?: () => void;
};

const statusOptions: CardStatus[] = [
  CardStatus.DESPACHADA,
  CardStatus.ENVIADA_INTERIOR,
  CardStatus.EN_RUTA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.ENTREGADA,
  CardStatus.RETORNADA,
];

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function splitTextChunks(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(/[\n|;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitPhones(raw: string | null | undefined) {
  if (!raw) return [];
  const matches = raw.match(/\d{7,}/g) ?? [];
  return [...new Set(matches)];
}

function requiresReturnReason(status: CardStatus) {
  return status === CardStatus.RETORNADA || status === CardStatus.DEVUELTA_TIENDA;
}

export function CardDetailModal({ cardId, onClose, onUpdated }: Props) {
  const [tab, setTab] = useState<"info" | "bitacora" | "status">("info");
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CardDetail | null>(null);
  const [motivos, setMotivos] = useState<ReturnReason[]>([]);
  const [statusValue, setStatusValue] = useState<CardStatus>(CardStatus.DESPACHADA);
  const [returnReason, setReturnReason] = useState("");
  const [isRemoteValue, setIsRemoteValue] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCard() {
    setLoading(true);
    const [cardRes, motivosRes] = await Promise.all([
      fetch(`/api/tarjetas/${cardId}`, { cache: "no-store" }),
      fetch("/api/config/motivos-retorno", { cache: "no-store" }),
    ]);

    const [cardJson, motivosJson] = await Promise.all([cardRes.json(), motivosRes.json()]);
    if (!cardRes.ok) {
      setMessage(cardJson.error ?? "No se pudo cargar la tarjeta");
      setLoading(false);
      return;
    }

    const nextCard = cardJson.card as CardDetail;
    setCard(nextCard);
    setStatusValue(nextCard.status as CardStatus);
    setReturnReason(nextCard.returnReason ?? "");
    setIsRemoteValue(nextCard.isRemote);
    setMotivos((motivosJson.motivos ?? []).filter((item: ReturnReason) => item.active));
    setLoading(false);
  }

  useEffect(() => {
    void loadCard();
  }, [cardId]);

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

  const phoneList = useMemo(() => splitPhones(card?.customer.telefonosRaw), [card?.customer.telefonosRaw]);
  const addressLines = useMemo(() => splitTextChunks(card?.customer.direccionRaw), [card?.customer.direccionRaw]);
  const referenceList = useMemo(
    () =>
      splitTextChunks(card?.externalReference).length
        ? splitTextChunks(card?.externalReference)
        : [],
    [card?.externalReference],
  );

  const timeline = useMemo(() => {
    if (!card) return [] as Array<{
      id: string;
      kind: "status" | "contact";
      createdAt: string;
      user: string;
      title: string;
      subtitle: string;
      status?: string;
    }>;

    const statusEntries = card.logs.map((log) => ({
      id: `status-${log.id}`,
      kind: "status" as const,
      createdAt: log.createdAt,
      user: log.byUser?.name || "Sistema",
      title: log.note || `Cambio de ${log.fromStatus ? statusLabel(log.fromStatus) : "N/A"} a ${statusLabel(log.toStatus)}`,
      subtitle: "Cambio de estado",
      status: log.toStatus,
    }));

    const contactEntries = card.contacts.map((contact) => ({
      id: `contact-${contact.id}`,
      kind: "contact" as const,
      createdAt: contact.createdAt,
      user: contact.user?.name || "Sistema",
      title: contact.comentario || (contact.contactado ? "Contacto marcado como exitoso" : "Contacto registrado"),
      subtitle: `Telefono usado: ${contact.telefonosUsados || "-"} · ${contact.contactado ? "Contactado" : "No contactado"}`,
    }));

    return [...statusEntries, ...contactEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [card]);

  async function saveStatus() {
    if (!card) return;
    setSaving(true);
    setMessage("");

    const payload = {
      id: card.id,
      status: statusValue,
      isRemote: isRemoteValue,
      returnReason: requiresReturnReason(statusValue) ? returnReason || null : null,
      note:
        note ||
        (requiresReturnReason(statusValue) && returnReason
          ? `Retorno: ${returnReason}`
          : "Actualizacion manual desde modal"),
    };

    const res = await fetch("/api/tarjetas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok) {
      setMessage(json.error ?? "No se pudo actualizar estado");
      setSaving(false);
      return;
    }

    setMessage("Estado actualizado");
    setSaving(false);
    await loadCard();
    onUpdated?.();
  }

  if (!card && loading) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35">
        <div className="w-full max-w-2xl rounded-2xl bg-white p-6">
          <p className="text-sm text-slate-500">Cargando tarjeta...</p>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35">
        <div className="w-full max-w-2xl rounded-2xl bg-white p-6">
          <p className="text-sm text-rose-700">{message || "No se pudo cargar la tarjeta"}</p>
          <button
            onClick={onClose}
            className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold tracking-wide text-blue-700">{card.tc}</p>
            <h3 className="font-display text-xl font-bold text-slate-900">{card.customer.nombre}</h3>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={card.status} />
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-200">
          <TabButton active={tab === "info"} onClick={() => setTab("info")} label="Informacion" />
          <TabButton active={tab === "bitacora"} onClick={() => setTab("bitacora")} label="Bitacora" />
          <TabButton active={tab === "status"} onClick={() => setTab("status")} label="Cambiar Status" />
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {tab === "info" ? (
            <div>
              <div className="grid gap-4 md:grid-cols-3">
                <InfoItem label="Cedula" value={card.customer.cedula} />
                <InfoItem label="Zona" value={card.zona} />
                <InfoItem label="Zona remota" value={card.isRemote ? "SI" : "NO"} />
                <InfoItem label="Provincia" value={card.provincia} />
                <InfoItem
                  label="F. Despacho"
                  value={card.dispatchDate ? new Date(card.dispatchDate).toLocaleDateString("es-DO") : "-"}
                />
                <InfoItem label="Tipo Emision" value={card.emissionType || "-"} />
                <InfoItem label="Tipo Entrega" value={card.deliveryType || "-"} />
                <InfoItem label="Contrato" value={card.contractType || "-"} />
                <InfoItem label="Suplidor" value={card.supplier || "-"} />
                <InfoItem label="Mensajero" value={card.currentMessenger?.nombre || "-"} />
                <InfoItem
                  label="SLA"
                  value={card.slaDueDate ? new Date(card.slaDueDate).toLocaleDateString("es-DO") : "-"}
                />
                <InfoItem label="Urgente" value={card.urgent ? "SI" : "NO"} />
                <InfoItem label="Referencia" value={card.externalReference || "-"} />
              </div>

              {addressLines.length ? (
                <section className="mt-5">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Direccion completa</p>
                  <div className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    {addressLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </section>
              ) : null}

              {referenceList.length ? (
                <section className="mt-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Referencias</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {referenceList.map((ref) => (
                      <span key={ref} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {ref}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="mt-5">
                <p className="text-xs uppercase tracking-wide text-slate-500">Telefonos</p>
                <div className="mt-2 space-y-2">
                  {phoneList.map((phone) => (
                    <div key={phone} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      {phone}
                    </div>
                  ))}
                  {!phoneList.length ? <p className="text-sm text-slate-500">Sin telefonos cargados.</p> : null}
                </div>
              </section>
            </div>
          ) : null}

          {tab === "bitacora" ? (
            <div className="space-y-2">
              {timeline.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`flex gap-3 py-3 ${index < timeline.length - 1 ? "border-b border-slate-100" : ""}`}
                >
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${entry.kind === "status" ? "bg-blue-500" : "bg-emerald-500"}`} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.kind === "status" ? <StatusBadge value={entry.status ?? card.status} /> : null}
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                        {entry.kind === "status" ? "Estado" : "Operativo"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleString("es-DO")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{entry.title}</p>
                    <p className="text-xs text-slate-500">{entry.subtitle}</p>
                    <p className="text-xs text-slate-500">{entry.user}</p>
                  </div>
                </div>
              ))}
              {!timeline.length ? <p className="text-sm text-slate-500">Sin movimientos registrados.</p> : null}
            </div>
          ) : null}

          {tab === "status" ? (
            <div>
              <p className="mb-3 text-sm text-slate-600">Selecciona el nuevo status:</p>
              <div className="space-y-2">
                {statusOptions.map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                      statusValue === option
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status_change"
                      checked={statusValue === option}
                      onChange={() => setStatusValue(option)}
                      className="accent-blue-700"
                    />
                    <span className="text-sm text-slate-800">{statusLabel(option)}</span>
                  </label>
                ))}
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                  Motivo retorno (si aplica)
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  disabled={!requiresReturnReason(statusValue)}
                >
                  <option value="">Seleccionar...</option>
                  {motivos.map((motivo) => (
                    <option key={motivo.id} value={motivo.nombre}>
                      {motivo.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Zona remota</label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isRemoteValue}
                    onChange={(e) => setIsRemoteValue(e.target.checked)}
                  />
                  Marcar tarjeta como zona remota
                </label>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Nota</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Comentario opcional del cambio"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                {message ? <p className="mr-auto text-sm text-emerald-700">{message}</p> : null}
                <button
                  onClick={saveStatus}
                  disabled={saving || (requiresReturnReason(statusValue) && !returnReason.trim())}
                  className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar cambio"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm font-medium ${
        active
          ? "border-blue-700 text-blue-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
