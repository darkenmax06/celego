"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PhoneCall,
  MessageSquare,
  Phone,
  MapPin,
  Calendar,
  AlertTriangle,
  Send,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { CardStatus } from "@prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { notificationFailureMessage, notifyInBrowser } from "@/lib/browser-notifications";
import { displayText } from "@/lib/display";
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

type OperativoMetadata = {
  contactado?: boolean;
  canalContacto?: "WHATSAPP" | "LLAMADA_DIRECTA" | null;
  comentarioContacto?: string;
  telefonos?: Array<{ num: string; principal: boolean; funciona: boolean; comentario?: string }>;
  nuevaDireccion?: string | null;
  fechaPreferenciaEntrega?: string | null;
  solicitudRetorno?: boolean;
  motivoRetorno?: string | null;
  traslado?: {
    provinciaDestino?: string;
    motivo?: string;
    solicitadoAt?: string;
    solicitadoPor?: string;
  } | null;
  updatedAt?: string;
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

function urgencyLabel(level: number) {
  if (level === 5) return "Nivel 5 (Extremadamente urgente)";
  if (level === 4) return "Nivel 4 (Muy urgente)";
  if (level === 3) return "Nivel 3 (Alta)";
  if (level === 2) return "Nivel 2 (Moderada)";
  return "Nivel 1 (Leve)";
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
                  : `TC: ${card.tc}`}
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
            <div>
              <div className="grid gap-4 md:grid-cols-3">
                <InfoItem label="Cedula" value={card.customer.cedula} />
                <InfoItem label="Zona original" value={card.zona} />
                <InfoItem label="Zona remota" value={card.isRemote ? "SI" : "NO"} />
                <InfoItem
                  label="Tipo tarjeta"
                  value={card.isAdditional ? "ADICIONAL" : "PRINCIPAL"}
                />
                <InfoItem
                  label="No. adicional"
                  value={card.isAdditional ? String(card.additionalIndex) : "-"}
                />
                <InfoItem label="Provincia original" value={card.provincia} />
                <InfoItem label="Zona facturable" value={card.reassignedZone || card.zona} />
                <InfoItem
                  label="Provincia de reasignacion"
                  value={card.reassignedProvince || "-"}
                />
                <InfoItem
                  label="F. Despacho"
                  value={card.dispatchDate ? new Date(card.dispatchDate).toLocaleDateString("es-DO") : "-"}
                />
                <InfoItem
                  label="Origen despacho"
                  value={
                    card.dispatchOrigin === "CENTRO_ACOPIO"
                      ? "Centro de acopio"
                      : card.dispatchOrigin === "TORRE_POPULAR"
                        ? "Torre Popular"
                        : card.dispatchOrigin === "BPD_DEBITO"
                          ? "BPD Débito"
                          : "Sin procedencia"
                  }
                />
                <InfoItem label="Tipo Emision" value={displayText(card.emissionType)} />
                <InfoItem label="Tipo Entrega" value={displayText(card.deliveryType)} />
                <InfoItem label="Contrato" value={displayText(card.contractType)} />
                <InfoItem label="Suplidor" value={displayText(card.supplier)} />
                <InfoItem label="Mensajero" value={card.currentMessenger?.nombre || "-"} />
                <InfoItem
                  label="Mensajero reasignado"
                  value={card.reassignedMessenger?.nombre || "-"}
                />
                <InfoItem
                  label="SLA"
                  value={card.slaDueDate ? new Date(card.slaDueDate).toLocaleDateString("es-DO") : "-"}
                />
                <InfoItem label="Urgente" value={card.urgent ? "SI" : "NO"} />
                <InfoItem
                  label="Nivel urgencia"
                  value={card.activeUrgentCase ? urgencyLabel(card.activeUrgentCase.level) : "-"}
                />
                <InfoItem label="Referencia" value={displayText(card.externalReference)} />
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

              {/* SECCIÓN DESTACADA: GESTIÓN OPERATIVA Y CONTACTO */}
              <section className="mt-5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 space-y-3.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <PhoneCall className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Gestión Operativa y Contacto</h4>
                      <p className="text-[11px] text-slate-500">Historial y datos acordados con el cliente</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowContactWizard(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-2xs active:scale-95"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                    Abrir Asistente de Contacto
                  </button>
                </div>

                {/* Grid de Estado, Canal, Fecha y Última Gestión */}
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Estado de Contacto
                    </span>
                    <div>
                      {operativoData?.solicitudRetorno ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-bold text-rose-700">
                          <AlertTriangle className="h-3.5 w-3.5" /> Retorno Solicitado
                        </span>
                      ) : operativoData?.traslado && Object.keys(operativoData.traslado).length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          <Send className="h-3.5 w-3.5" /> Traslado Solicitado
                        </span>
                      ) : operativoData?.contactado ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Contactada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                          <Clock className="h-3.5 w-3.5" /> Pendiente de Contacto
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Canal Efectivo
                    </span>
                    <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      {operativoData?.canalContacto === "WHATSAPP" ? (
                        <>
                          <MessageSquare className="h-4 w-4 text-emerald-600" /> WhatsApp
                        </>
                      ) : operativoData?.canalContacto === "LLAMADA_DIRECTA" ? (
                        <>
                          <Phone className="h-4 w-4 text-blue-600" /> Llamada Directa
                        </>
                      ) : (
                        <span className="text-slate-400 font-normal">No especificado</span>
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Fecha Preferencia
                    </span>
                    <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {operativoData?.fechaPreferenciaEntrega
                        ? new Date(operativoData.fechaPreferenciaEntrega).toLocaleDateString("es-DO")
                        : <span className="text-slate-400 font-normal">Sin fecha fijada</span>}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Última Gestión
                    </span>
                    <p className="text-xs font-semibold text-slate-800">
                      {operativoData?.updatedAt
                        ? new Date(operativoData.updatedAt).toLocaleString("es-DO")
                        : <span className="text-slate-400 font-normal">Sin registro previo</span>}
                    </p>
                  </div>
                </div>

                {/* Nueva Dirección confirmada */}
                {operativoData?.nuevaDireccion ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-800 uppercase tracking-wide">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                      Nueva Dirección de Entrega (Confirmada):
                    </div>
                    <p className="mt-1 text-slate-800 font-medium leading-relaxed">
                      {operativoData.nuevaDireccion}
                    </p>
                  </div>
                ) : null}

                {/* Motivo de retorno si aplica */}
                {operativoData?.solicitudRetorno && operativoData?.motivoRetorno ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs">
                    <span className="font-bold text-rose-800 uppercase tracking-wide">Motivo de Solicitud de Retorno:</span>
                    <p className="mt-1 text-rose-900 font-medium">{operativoData.motivoRetorno}</p>
                  </div>
                ) : null}

                {/* Traslado si aplica */}
                {operativoData?.traslado && typeof operativoData.traslado === "object" && operativoData.traslado.provinciaDestino ? (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs">
                    <span className="font-bold text-indigo-800 uppercase tracking-wide">Traslado a Otra Provincia Solicitado:</span>
                    <p className="mt-1 text-indigo-900">
                      Destino: <strong>{operativoData.traslado.provinciaDestino}</strong> · Motivo: {operativoData.traslado.motivo || "Traslado solicitado"}
                    </p>
                  </div>
                ) : null}

                {/* Observaciones generales de la llamada */}
                {operativoData?.comentarioContacto ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                    <span className="font-bold text-slate-700 uppercase tracking-wide">Observaciones de la Llamada:</span>
                    <p className="mt-1 text-slate-700 leading-relaxed">{operativoData.comentarioContacto}</p>
                  </div>
                ) : null}

                {/* Teléfonos verificados */}
                {operativoData?.telefonos && operativoData.telefonos.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Teléfonos Verificados / Actualizados</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {operativoData.telefonos.map((t, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between rounded-xl border p-2.5 text-xs ${
                            t.funciona ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={t.principal ? "text-amber-500 font-bold" : "text-slate-300"}>★</span>
                            <span className="font-mono font-bold text-slate-900">{t.num}</span>
                            {t.funciona ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                Funciona
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                No funciona
                              </span>
                            )}
                          </div>
                          {t.comentario ? (
                            <span className="text-[11px] text-slate-500 truncate max-w-[160px]" title={t.comentario}>
                              {t.comentario}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="mt-5">
                <p className="text-xs uppercase tracking-wide text-slate-500">Telefonos Registrados</p>
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
