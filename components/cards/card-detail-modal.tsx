"use client";

import { useEffect, useMemo, useState } from "react";
import { CardStatus } from "@prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { notificationFailureMessage, notifyInBrowser } from "@/lib/browser-notifications";
import { SLA_CLOSED_STATUSES } from "@/lib/list-query/descriptors/sla-vencidas";
import { CardInfoTab, cardTypeLabel } from "@/components/cards/card-detail/card-info-tab";
import type { OperativoMetadata } from "@/components/cards/card-detail/contact-management";
import {
  OperativeContactWizard,
  type PhoneState,
  type OperativeWizardCard,
} from "@/components/operativo/operative-contact-wizard";

type ReturnReason = { id: string; nombre: string; active: boolean };
type Province = { id: string; nombre: string; zona: string; active: boolean };
type Messenger = {
  id: string;
  nombre: string;
  provinciaTrabajo: string | null;
  activo: boolean;
};

type CardDetail = {
  id: string;
  tc: string;
  requestNumber?: string | null;
  productType?: "CREDITO" | "DEBITO" | null;
  externalReference: string | null;
  zona: string;
  provincia: string;
  isRemote: boolean;
  dispatchDate: string | null;
  dispatchOrigin: "TORRE_POPULAR" | "CENTRO_ACOPIO" | "BPD_DEBITO" | null;
  deliveryType: string | null;
  emissionType: string | null;
  supplier: string | null;
  contractType: string | null;
  hasContract: boolean;
  contractImageAt: string | null;
  status: string;
  reassignedProvince: string | null;
  reassignedZone: string | null;
  reassignedAt: string | null;
  isAdditional: boolean;
  additionalIndex: number;
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
  reassignedMessenger: { id: string; nombre: string } | null;
  deliveryReassignments: Array<{
    id: string;
    fromProvince: string;
    fromZone: string;
    fromMessengerName: string | null;
    toProvince: string;
    toZone: string;
    toMessengerName: string;
    note: string | null;
    createdAt: string;
    byUser: { name: string } | null;
  }>;
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
  activeUrgentCase: {
    id: string;
    level: number;
    nextNotificationAt: string | null;
    lastNotifiedAt: string | null;
  } | null;
};

type Props = {
  cardId: string;
  onClose: () => void;
  onUpdated?: () => void;
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
  ok?: boolean;
  urgent?: boolean;
  level?: number;
  label?: string;
  intervalMinutes?: number;
  nextNotificationAt?: string | null;
  notifyNow?: boolean;
  notification?: UrgentNotification | null;
  error?: string;
};

const CREDIT_STATUS_OPTIONS: CardStatus[] = [
  CardStatus.DESPACHADA,
  CardStatus.ENVIADA_INTERIOR,
  CardStatus.EN_RUTA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.ENTREGADA,
  CardStatus.RETORNADA,
];

const DEBIT_STATUS_OPTIONS: CardStatus[] = [
  CardStatus.DESPACHADA,
  CardStatus.EN_RUTA,
  CardStatus.NO_LOCALIZADO,
  CardStatus.TD_ENTREGADO,
  CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  CardStatus.TD_NO_LE_INTERESA,
  CardStatus.TD_RETIRADA_EN_OFICINA,
  CardStatus.TD_SOLICITADA_POR_ERROR,
  CardStatus.TD_ZONA_FUERA_COBERTURA,
];

function statusLabel(value: string) {
  if (value.startsWith("TD_")) {
    return value.replace(/^TD_/, "TD- ").replaceAll("_", " ");
  }
  if (value === "NO_LOCALIZADO") return "No Localizado";
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

function requiresReturnReason(status: CardStatus, isDebit = false) {
  if (isDebit) return false;
  return status === CardStatus.RETORNADA || status === CardStatus.DEVUELTA_TIENDA;
}

function formatUrgentClock(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO");
}

export function CardDetailModal({ cardId, onClose, onUpdated }: Props) {
  const [tab, setTab] = useState<"info" | "bitacora" | "status" | "reassignment">("info");
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CardDetail | null>(null);
  const [motivos, setMotivos] = useState<ReturnReason[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [canManageReassignment, setCanManageReassignment] = useState(false);
  const [statusValue, setStatusValue] = useState<CardStatus>(CardStatus.DESPACHADA);
  const [returnReason, setReturnReason] = useState("");
  const [isRemoteValue, setIsRemoteValue] = useState(false);
  const [hasContractValue, setHasContractValue] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingUrgency, setSavingUrgency] = useState(false);
  const [message, setMessage] = useState("");
  const [notificationIssue, setNotificationIssue] = useState("");
  const [reassignmentProvinceId, setReassignmentProvinceId] = useState("");
  const [reassignmentMessengerId, setReassignmentMessengerId] = useState("");
  const [reassignmentNote, setReassignmentNote] = useState("");
  const [savingReassignment, setSavingReassignment] = useState(false);
  const [urgencyEnabled, setUrgencyEnabled] = useState(false);
  const [urgencyLevel, setUrgencyLevel] = useState(3);
  const [urgencyComment, setUrgencyComment] = useState("");

  async function loadCard() {
    setLoading(true);
    const [cardRes, motivosRes, provincesRes] = await Promise.all([
      fetch(`/api/tarjetas/${cardId}`, { cache: "no-store" }),
      fetch("/api/config/motivos-retorno", { cache: "no-store" }),
      fetch("/api/config/provincias", { cache: "no-store" }),
    ]);

    const [cardJson, motivosJson, provincesJson] = await Promise.all([
      cardRes.json(),
      motivosRes.json(),
      provincesRes.json().catch(() => ({ provincias: [] })),
    ]);
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
    setHasContractValue(nextCard.hasContract);
    setUrgencyEnabled(nextCard.urgent);
    setUrgencyLevel(nextCard.activeUrgentCase?.level ?? 3);
    setUrgencyComment("");
    setNotificationIssue("");
    setMotivos((motivosJson.motivos ?? []).filter((item: ReturnReason) => item.active));
    const activeProvinces = ((provincesJson.provincias ?? []) as Province[]).filter(
      (item) => item.active,
    );
    setProvinces(activeProvinces);
    setCanManageReassignment(provincesRes.ok);
    setReassignmentProvinceId(
      activeProvinces.find((item) => item.nombre === nextCard.reassignedProvince)?.id ?? "",
    );
    setReassignmentMessengerId(nextCard.reassignedMessenger?.id ?? "");
    setReassignmentNote("");
    setLoading(false);
  }

  useEffect(() => {
    void loadCard();
  }, [cardId]);

  useEffect(() => {
    if (!reassignmentProvinceId || !canManageReassignment) {
      setMessengers([]);
      setReassignmentMessengerId("");
      return;
    }

    const province = provinces.find((item) => item.id === reassignmentProvinceId);
    if (!province) return;

    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({
        onlyActive: "1",
        province: province.nombre,
      });
      const response = await fetch(`/api/mensajeros?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({ messengers: [] }));
      if (cancelled) return;
      const nextMessengers = (json.messengers ?? []) as Messenger[];
      setMessengers(nextMessengers);
      setReassignmentMessengerId((current) =>
        nextMessengers.some((item) => item.id === current) ? current : "",
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [canManageReassignment, provinces, reassignmentProvinceId]);

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

  const [showContactWizard, setShowContactWizard] = useState(false);

  const phoneList = useMemo(() => splitPhones(card?.customer.telefonosRaw), [card?.customer.telefonosRaw]);
  const addressLines = useMemo(() => splitTextChunks(card?.customer.direccionRaw), [card?.customer.direccionRaw]);
  const referenceList = useMemo(
    () =>
      splitTextChunks(card?.externalReference).length
        ? splitTextChunks(card?.externalReference)
        : [],
    [card?.externalReference],
  );

  const operativoData = useMemo(() => {
    const meta = card?.metadata as Record<string, unknown> | null;
    if (!meta || typeof meta !== "object") return null;
    const op = meta.operativo as Record<string, unknown> | null;
    if (!op || typeof op !== "object") return null;
    return op as OperativoMetadata;
  }, [card?.metadata]);

  const provincesList = useMemo(() => provinces.map((p) => p.nombre).sort(), [provinces]);

  const wizardCard: OperativeWizardCard | null = useMemo(() => {
    if (!card) return null;
    const fallbackPhones = phoneList.map((num, idx) => ({
      num,
      principal: idx === 0,
      funciona: false,
      comentario: "",
    }));
    const phones = operativoData?.telefonos && operativoData.telefonos.length > 0 ? operativoData.telefonos : fallbackPhones;

    return {
      id: card.id,
      cardId: card.id,
      tc: card.tc,
      requestNumber: card.requestNumber ?? null,
      nombre: card.customer.nombre,
      cedula: card.customer.cedula,
      provincia: card.provincia,
      zona: card.zona,
      status: card.status,
      productType: card.productType ?? null,
      urgent: card.urgent,
      remaining: null,
      presinto: null,
      fechaDespacho: card.dispatchDate,
      tipoEmision: card.emissionType,
      tipoEntrega: card.deliveryType,
      direcciones: addressLines,
      refs: referenceList,
      mensajero: card.currentMessenger?.nombre || "Sin asignar",
      telefonos: phones,
      comentarioContacto: operativoData?.comentarioContacto || "",
      contactado: Boolean(operativoData?.contactado),
      canalContacto: operativoData?.canalContacto || null,
      nuevaDireccion: operativoData?.nuevaDireccion || null,
      fechaPreferenciaEntrega: operativoData?.fechaPreferenciaEntrega || null,
      solicitudRetorno: Boolean(operativoData?.solicitudRetorno),
      motivoRetorno: operativoData?.motivoRetorno || null,
      traslado: operativoData?.traslado ?? null,
    };
  }, [card, operativoData, phoneList, addressLines, referenceList]);

  async function handleSaveContactFromWizard(payload: {
    telefonos: PhoneState[];
    comentario: string;
    contactado: boolean;
    canalContacto?: "WHATSAPP" | "LLAMADA_DIRECTA" | null;
    nuevaDireccion?: string | null;
    fechaPreferenciaEntrega?: string | null;
    solicitudRetorno?: boolean;
    motivoRetorno?: string | null;
    trasladoProvincia?: string | null;
    trasladoMotivo?: string | null;
  }) {
    if (!card) return "No hay tarjeta";
    const res = await fetch("/api/operativo/contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: card.id,
        ...payload,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return data.error ?? "No se pudo guardar contacto";
    }
    await loadCard();
    onUpdated?.();
    return null;
  }

  const timeline = useMemo(() => {
    if (!card) return [] as Array<{
      id: string;
      kind: "status" | "contact" | "reassignment";
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
      user: contact.user?.name || "Operador",
      title: contact.comentario || (contact.contactado ? "Contacto marcado como exitoso" : "Contacto registrado"),
      subtitle: `Teléfonos: ${contact.telefonosUsados || "-"} · ${contact.contactado ? "✓ Contactado" : "○ No contactado"}`,
    }));

    const reassignmentEntries = card.deliveryReassignments.map((reassignment) => ({
      id: `reassignment-${reassignment.id}`,
      kind: "reassignment" as const,
      createdAt: reassignment.createdAt,
      user: reassignment.byUser?.name || "Sistema",
      title: `Entrega reasignada de ${reassignment.fromProvince} a ${reassignment.toProvince}`,
      subtitle: `${reassignment.fromMessengerName || "Sin mensajero"} → ${reassignment.toMessengerName} · Zona ${reassignment.toZone}${reassignment.note ? ` · ${reassignment.note}` : ""}`,
    }));

    return [...statusEntries, ...contactEntries, ...reassignmentEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [card]);

  const isDebit = card?.productType === "DEBITO" || card?.dispatchOrigin === "BPD_DEBITO";
  const isSlaClosed = card ? (SLA_CLOSED_STATUSES as readonly string[]).includes(card.status) : false;
  const availableStatusOptions = isDebit ? DEBIT_STATUS_OPTIONS : CREDIT_STATUS_OPTIONS;

  const canReassign =
    card?.status === CardStatus.ENTREGADA || card?.status === CardStatus.ENTREGA_DIGITAL;

  useEffect(() => {
    if (tab === "reassignment" && !canReassign) {
      setTab("info");
    }
  }, [canReassign, tab]);

  async function saveStatus() {
    if (!card) return;
    setSaving(true);
    setMessage("");

    const payload = {
      id: card.id,
      status: statusValue,
      isRemote: isRemoteValue,
      hasContract: hasContractValue,
      returnReason: requiresReturnReason(statusValue, isDebit) ? returnReason || null : returnReason || null,
      note:
        note ||
        (requiresReturnReason(statusValue, isDebit) && returnReason
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

  async function saveReassignment() {
    if (!card || !reassignmentProvinceId || !reassignmentMessengerId) return;
    setSavingReassignment(true);
    setMessage("");

    const response = await fetch(`/api/tarjetas/${card.id}/reasignacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provinceId: reassignmentProvinceId,
        messengerId: reassignmentMessengerId,
        note: reassignmentNote || undefined,
      }),
    });
    const json = await response.json().catch(() => ({ error: "No se pudo reasignar la entrega" }));

    if (!response.ok) {
      setMessage(json.error ?? "No se pudo reasignar la entrega");
      setSavingReassignment(false);
      return;
    }

    setMessage("Reasignacion registrada");
    setSavingReassignment(false);
    await loadCard();
    onUpdated?.();
  }

  async function saveUrgencySettings() {
    if (!card) return;
    setSavingUrgency(true);
    setMessage("");

    const res = await fetch("/api/operativo/urgencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: card.id,
        urgent: urgencyEnabled,
        level: urgencyEnabled ? urgencyLevel : undefined,
        note: urgencyComment.trim() || undefined,
      }),
    });
    const json = (await res
      .json()
      .catch(() => ({ error: "No se pudo actualizar urgencia" }))) as UrgencyMutationResponse;

    if (!res.ok) {
      setMessage(json.error ?? "No se pudo actualizar urgencia");
      setSavingUrgency(false);
      return;
    }

    if (json.notifyNow && json.notification) {
      const result = await notifyInBrowser({
        title: `Urgencia activa: ${json.notification.label}`,
        body: `${json.notification.cliente} - TC ${json.notification.tc}. Primera notificacion enviada.`,
        tag: `urgent-now-${json.notification.urgentCaseId}`,
        requireInteraction: true,
      });
      const warning = notificationFailureMessage(result);
      if (warning) {
        setNotificationIssue(warning);
      } else {
        setNotificationIssue("");
      }
    }

    setMessage(urgencyEnabled ? "Urgencia actualizada" : "Urgencia desactivada");
    setSavingUrgency(false);
    await loadCard();
    onUpdated?.();
  }

  async function resolveUrgency() {
    if (!card) return;
    setSavingUrgency(true);
    setMessage("");

    const res = await fetch("/api/operativo/urgencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: card.id,
        urgent: false,
        resolve: true,
        note: urgencyComment.trim() || undefined,
      }),
    });
    const json = (await res
      .json()
      .catch(() => ({ error: "No se pudo resolver urgencia" }))) as UrgencyMutationResponse;

    if (!res.ok) {
      setMessage(json.error ?? "No se pudo resolver urgencia");
      setSavingUrgency(false);
      return;
    }

    setUrgencyEnabled(false);
    setMessage("Caso urgente marcado como resuelto");
    setSavingUrgency(false);
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
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold tracking-wide text-blue-700">
                {isDebit
                  ? `Solicitud Débito: ${card.requestNumber || card.tc}`
                  : `TC ${card.tc}`}
              </p>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  isDebit
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-blue-100 text-blue-800 border border-blue-200"
                }`}
              >
                {isDebit ? "Débito" : "Crédito"}
              </span>
              {card.isAdditional ? (
                <span className="text-xs font-medium text-slate-500">· {cardTypeLabel(card)}</span>
              ) : null}
            </div>
            <h3 className="font-display text-xl font-bold text-slate-900 mt-0.5">{card.customer.nombre}</h3>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={card.status} />
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-200 transition"
              title="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-200">
          <TabButton active={tab === "info"} onClick={() => setTab("info")} label="Informacion" />
          <TabButton active={tab === "bitacora"} onClick={() => setTab("bitacora")} label="Bitacora" />
          <TabButton active={tab === "status"} onClick={() => setTab("status")} label="Cambiar Status" />
          {canReassign && canManageReassignment ? (
            <TabButton
              active={tab === "reassignment"}
              onClick={() => setTab("reassignment")}
              label="Reasignacion"
            />
          ) : null}
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {tab === "info" ? (
            <CardInfoTab
              card={card}
              operativo={operativoData}
              addressLines={addressLines}
              referenceList={referenceList}
              phoneList={phoneList}
              isClosed={isSlaClosed}
              onOpenContactWizard={() => setShowContactWizard(true)}
            />
          ) : null}

          {tab === "bitacora" ? (
            <div className="space-y-2">
              {timeline.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`flex gap-3 py-3 ${index < timeline.length - 1 ? "border-b border-slate-100" : ""}`}
                >
                  <div
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      entry.kind === "status"
                        ? "bg-blue-500"
                        : entry.kind === "reassignment"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.kind === "status" ? <StatusBadge value={entry.status ?? card.status} /> : null}
                      <span
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                          entry.kind === "reassignment"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {entry.kind === "status"
                          ? "Estado"
                          : entry.kind === "reassignment"
                            ? "Reasignacion"
                            : "Operativo"}
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
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  Selecciona el nuevo status:
                </p>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 font-medium">
                  {isDebit ? "Opciones Débito" : "Opciones Crédito"}
                </span>
              </div>
              <div className="space-y-2">
                {availableStatusOptions.map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                      statusValue === option
                        ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-300"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status_change"
                      checked={statusValue === option}
                      onChange={() => setStatusValue(option)}
                      className="accent-blue-700 h-4 w-4"
                    />
                    <span className="text-sm font-medium text-slate-800">{statusLabel(option)}</span>
                  </label>
                ))}
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                  Motivo retorno {isDebit ? "(opcional para débito)" : "(requerido si retornada/devuelta)"}
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  disabled={!requiresReturnReason(statusValue, isDebit) && !isDebit}
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
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Contrato</label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={hasContractValue}
                    onChange={(e) => setHasContractValue(e.target.checked)}
                  />
                  Tarjeta requiere contrato
                </label>
                {card.status === CardStatus.ENTREGA_DIGITAL_SIN_CONTRATO ||
                card.status === CardStatus.ENTREGA_SIN_CONTRATO ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Este cambio no resuelve el estado pendiente por contrato: use el modulo de
                    &quot;Contratos pendientes&quot; para subir la imagen o marcar la entrega.
                  </p>
                ) : null}
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

              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Gestion de urgencia (CE)
                </p>

                <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={urgencyEnabled}
                    onChange={(event) => setUrgencyEnabled(event.target.checked)}
                  />
                  Marcar tarjeta como urgente
                </label>

                {urgencyEnabled ? (
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nivel de urgencia
                    <select
                      value={urgencyLevel}
                      onChange={(event) => setUrgencyLevel(Number(event.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"
                    >
                      <option value={1}>Nivel 1 (Leve) - cada 4.5 horas</option>
                      <option value={2}>Nivel 2 (Moderada) - cada 3.5 horas</option>
                      <option value={3}>Nivel 3 (Alta) - cada 2.5 horas</option>
                      <option value={4}>Nivel 4 (Muy urgente) - cada 1.5 horas</option>
                      <option value={5}>Nivel 5 (Extremadamente urgente) - cada 30 min</option>
                    </select>
                  </label>
                ) : null}

                <div className="mt-2 text-xs text-slate-600">
                  <p>Ultima alerta: {formatUrgentClock(card.activeUrgentCase?.lastNotifiedAt)}</p>
                  <p>Proxima alerta: {formatUrgentClock(card.activeUrgentCase?.nextNotificationAt)}</p>
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                    Comentario de urgencia
                  </label>
                  <textarea
                    value={urgencyComment}
                    onChange={(event) => setUrgencyComment(event.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="Ej: cliente confirma disponibilidad, mantener prioridad..."
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
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
                  <button
                    type="button"
                    onClick={() => void saveUrgencySettings()}
                    disabled={savingUrgency}
                    className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {savingUrgency ? "Guardando..." : "Guardar urgencia"}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <div className="mr-auto">
                  {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
                  {notificationIssue ? <p className="mt-1 text-xs text-amber-700">{notificationIssue}</p> : null}
                </div>
                <button
                  onClick={saveStatus}
                  disabled={saving || (requiresReturnReason(statusValue, isDebit) && !returnReason.trim())}
                  className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar cambio"}
                </button>
              </div>
            </div>
          ) : null}

          {tab === "reassignment" && canReassign ? (
            <div>
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Entrega registrada
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <InfoItem label="Provincia original" value={card.provincia} />
                  <InfoItem label="Zona original" value={card.zona} />
                  <InfoItem
                    label="Provincia efectiva"
                    value={card.reassignedProvince || card.provincia}
                  />
                  <InfoItem
                    label="Mensajero efectivo"
                    value={card.reassignedMessenger?.nombre || card.currentMessenger?.nombre || "-"}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  Provincia de entrega
                  <select
                    value={reassignmentProvinceId}
                    onChange={(event) => setReassignmentProvinceId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    <option value="">Seleccionar provincia...</option>
                    {provinces.map((province) => (
                      <option key={province.id} value={province.id}>
                        {province.nombre} · Zona {province.zona}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-700">
                  Mensajero de la provincia
                  <select
                    value={reassignmentMessengerId}
                    onChange={(event) => setReassignmentMessengerId(event.target.value)}
                    disabled={!reassignmentProvinceId || !messengers.length}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
                  >
                    <option value="">
                      {reassignmentProvinceId && !messengers.length
                        ? "No hay mensajeros disponibles"
                        : "Seleccionar mensajero..."}
                    </option>
                    {messengers.map((messenger) => (
                      <option key={messenger.id} value={messenger.id}>
                        {messenger.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-4 block text-sm text-slate-700">
                Nota de reasignacion
                <textarea
                  value={reassignmentNote}
                  onChange={(event) => setReassignmentNote(event.target.value)}
                  rows={3}
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Motivo o referencia de la correccion"
                />
              </label>

              <div className="mt-4 flex items-center justify-end gap-3">
                {message ? <p className="mr-auto text-sm text-slate-700">{message}</p> : null}
                <button
                  type="button"
                  onClick={() => void saveReassignment()}
                  disabled={
                    savingReassignment ||
                    !reassignmentProvinceId ||
                    !reassignmentMessengerId ||
                    !messengers.length
                  }
                  className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {savingReassignment ? "Guardando..." : "Registrar reasignacion"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {showContactWizard && wizardCard ? (
        <OperativeContactWizard
          card={wizardCard}
          index={0}
          total={1}
          provincesList={provincesList}
          onClose={() => setShowContactWizard(false)}
          onPrev={() => {}}
          onNext={() => {}}
          onSave={handleSaveContactFromWizard}
        />
      ) : null}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
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
