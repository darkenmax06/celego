"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check, Phone, MessageSquare, MapPin, Send, ArrowLeft, ArrowRight, X, AlertTriangle, Truck, Layers } from "lucide-react";
import { CardGroupAssignModal } from "@/components/cards/card-group-assign-modal";
import type { CardGroupSummary } from "@/lib/use-card-groups";
import { NoContactConfirm } from "@/components/operativo/no-contact-confirm";
import { PhoneEstadoSelect } from "@/components/operativo/phone-estado-select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildContactTemplateContext,
  DEFAULT_SCRIPT_TEXT,
  DEFAULT_WHATSAPP_TEXT,
  renderContactTemplate,
} from "@/lib/contact-template";
import { validateContactedCall, type PhoneCallDetail } from "@/lib/contact-call-shared";
import { copyTextToClipboard } from "@/lib/clipboard";
import { buildWhatsAppUrl, formatPhoneDisplay, toWhatsAppNumber } from "@/lib/phone";

export type PhoneState = {
  num: string;
  principal: boolean;
  funciona: boolean;
  comentario?: string;
  /** Calls overhaul: per-phone call outcome (`PHONE_CALL_STATES`), `""` when not set. */
  estado?: string;
};

export type OperativeWizardCard = {
  id: string;
  cardId: string | null;
  tc: string;
  requestNumber?: string | null;
  nombre: string;
  cedula: string;
  provincia: string;
  zona: string;
  status: string;
  urgent?: boolean;
  urgentLevel?: number | null;
  urgentLabel?: string | null;
  remaining?: number | null;
  presinto?: string | null;
  fechaDespacho?: string | null;
  slaDueDate?: string | null;
  tipoEmision?: string | null;
  tipoEntrega?: string | null;
  direcciones: string[];
  refs: string[];
  mensajero?: string;
  mensajeroTelefono?: string | null;
  telefonos: PhoneState[];
  comentarioContacto?: string;
  contactado?: boolean;
  canalContacto?: "WHATSAPP" | "LLAMADA_DIRECTA" | null;
  nuevaDireccion?: string | null;
  fechaPreferenciaEntrega?: string | null;
  solicitudRetorno?: boolean;
  motivoRetorno?: string | null;
  traslado?: Record<string, unknown> | null;
  hasAttempt?: boolean;
  /** Ids of the CardGroups this card belongs to. Names resolve via useCardGroups. */
  groupIds?: string[];
  readOnly?: boolean;
  productType?: string | null;
  grupos?: string[];
};

export type WizardSavePayload = {
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
  telefonosDetalle?: PhoneCallDetail[];
  motivoNoContacto?: string | null;
};

/**
 * `string` = error message to show; `null` = saved; an object = saved and
 * carries the card status after the save (e.g. after a return request).
 */
export type WizardSaveResult = string | null | { status?: string | null };

type Props = {
  card: OperativeWizardCard;
  index: number;
  total: number;
  provincesList?: string[];
  /** Name of the signed-in operator, used for the `{{operador}}` template variable. */
  operatorName?: string | null;
  /** Override prev/next availability (e.g. when the list spans several pages). */
  hasPrev?: boolean;
  hasNext?: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSave: (payload: WizardSavePayload) => Promise<WizardSaveResult>;
  /**
   * Stage B, Task B3. Gates the footer's group action to ADMIN/OPERADOR.
   */
  canManageGroups?: boolean;
  /**
   * The group list the host screen already fetched with `useCardGroups()`.
   * Passed in rather than fetched here so opening the wizard does not repeat
   * a request the screen behind it has already made. Also resolves
   * `card.groupIds` into names with no extra endpoint.
   */
  cardGroups?: CardGroupSummary[];
  /** Lets the host refresh its own group state after an assignment. */
  onGroupsChanged?: () => void;
};

/** Phones worth sending (the API requires at least 3 characters). */
function usablePhones(phones: PhoneState[]) {
  return phones.filter((phone) => phone.num && phone.num.trim().length >= 3);
}

/** `telefonos` as persisted in the card metadata (without the per-call `estado`). */
function toSavedPhones(phones: PhoneState[]): PhoneState[] {
  return usablePhones(phones).map(({ num, principal, funciona, comentario }) => ({ num, principal, funciona, comentario }));
}

/** Per-phone call detail stored on the `ContactLog` (`telefonosDetalle`). */
export function toTelefonosDetalle(phones: PhoneState[]): PhoneCallDetail[] {
  return usablePhones(phones).map((phone) => ({
    numero: phone.num.trim(),
    estado: phone.estado?.trim() || null,
    nota: phone.comentario?.trim() || null,
  }));
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function OperativeContactWizard({
  card,
  index,
  total,
  provincesList = [],
  operatorName,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
  onSave,
  canManageGroups = false,
  cardGroups = [],
  onGroupsChanged,
}: Props) {
  const canPrev = hasPrev ?? index > 0;
  const canNext = hasNext ?? index < total - 1;
  // Column 2 state
  const [telefonos, setTelefonos] = useState<PhoneState[]>([]);
  const [newPhoneNum, setNewPhoneNum] = useState("");
  const [newPhoneComment, setNewPhoneComment] = useState("");
  const [canalContacto, setCanalContacto] = useState<"WHATSAPP" | "LLAMADA_DIRECTA" | null>(null);
  const [nuevaDireccion, setNuevaDireccion] = useState("");
  const [fechaPreferencia, setFechaPreferencia] = useState("");
  const [comentarioGeneral, setComentarioGeneral] = useState("");

  // Column 3 state (Script & WhatsApp template)
  const [scriptTemplate, setScriptTemplate] = useState(DEFAULT_SCRIPT_TEXT);
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEXT);
  const [scriptTab, setScriptTab] = useState<"SPEECH" | "WHATSAPP">("SPEECH");
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "error">("idle");

  // Modals inside wizard
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetProvince, setTransferTargetProvince] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [showNoContactConfirm, setShowNoContactConfirm] = useState(false);
  const [motivoNoContacto, setMotivoNoContacto] = useState("");
  const [noContactError, setNoContactError] = useState("");

  // Stage B, Task B3: group assignment for this single card.
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  /**
   * The groups this card already belongs to, resolved from `card.groupIds`
   * (Stage A) against the list the host screen already loaded. A group id with
   * no match is skipped rather than rendered raw: the only way that happens is
   * a group created or deleted since the host's last `reload()`.
   */
  const memberOfGroups = useMemo(() => {
    const ids = new Set(card.groupIds ?? []);
    return cardGroups.filter((group) => ids.has(group.id));
  }, [card.groupIds, cardGroups]);

  // Save states
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  // Load template from config
  useEffect(() => {
    fetch("/api/config/plantilla-comunicacion", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.config?.scriptText) setScriptTemplate(data.config.scriptText);
        if (data.config?.whatsappText) setWhatsappTemplate(data.config.whatsappText);
      })
      .catch(() => {});
  }, []);

  // Initialize card data once per card: a refreshed card object for the SAME
  // id (e.g. after saving) must not wipe the operator's feedback.
  const initializedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (initializedForRef.current === card.id) return;
    initializedForRef.current = card.id;
    const basePhones = card.telefonos && card.telefonos.length > 0
      ? card.telefonos.map((t) => ({ ...t, comentario: t.comentario || "", estado: t.estado || "" }))
      : [{ num: "", principal: true, funciona: false, comentario: "", estado: "" }];

    setTelefonos(basePhones);
    setCanalContacto(card.canalContacto || null);
    setNuevaDireccion(card.nuevaDireccion || "");
    setFechaPreferencia(card.fechaPreferenciaEntrega || "");
    setComentarioGeneral(card.comentarioContacto || "");
    setTransferTargetProvince("");
    setTransferReason("");
    setReturnReason(card.motivoRetorno || "");
    setMotivoNoContacto("");
    setNoContactError("");
    setShowNoContactConfirm(false);
    setSavedStatus(null);
    setFeedback("");
  }, [card]);

  const anySubModalOpen = showTransferModal || showReturnModal || showNoContactConfirm;

  // Keyboard: ESC closes, ←/→ move between cards (never while typing or inside a sub-modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (anySubModalOpen) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (isEditableTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" && canPrev) onPrev();
      if (e.key === "ArrowRight" && canNext) onNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onPrev, onNext, canPrev, canNext, anySubModalOpen]);

  // Resolved dynamic text for Column 3 (single source of truth: lib/contact-template)
  const principalPhone = useMemo(() => {
    return telefonos.find((t) => t.principal)?.num || telefonos[0]?.num || null;
  }, [telefonos]);

  const templateContext = useMemo(
    () =>
      buildContactTemplateContext({
      nombre: card.nombre,
      cedula: card.cedula,
      tc: card.tc,
      provincia: card.provincia,
      zona: card.zona,
      direccion: card.direcciones.join(" · "),
      nuevaDireccion,
      mensajero: card.mensajero,
      mensajeroTelefono: card.mensajeroTelefono,
      solicitud: card.requestNumber || card.tipoEmision,
      telefonos: telefonos.map((phone) => phone.num).filter(Boolean),
      telefonoPrincipal: principalPhone,
      operador: operatorName,
      canalContacto,
      fechaPreferenciaEntrega: fechaPreferencia || null,
      slaDueDate: card.slaDueDate,
      productType: card.productType,
      grupos: card.grupos,
      }),
    [card, nuevaDireccion, principalPhone, telefonos, operatorName, canalContacto, fechaPreferencia],
  );

  const resolvedText = useMemo(
    () => renderContactTemplate(scriptTab === "WHATSAPP" ? whatsappTemplate : scriptTemplate, templateContext),
    [scriptTab, scriptTemplate, whatsappTemplate, templateContext],
  );

  // Always the WhatsApp template, whichever tab is active.
  const whatsappText = useMemo(
    () => renderContactTemplate(whatsappTemplate, templateContext),
    [whatsappTemplate, templateContext],
  );

  const whatsappTargets = useMemo(
    () =>
      telefonos
        .filter((phone) => phone.num.trim())
        .map((phone) => ({ num: phone.num, target: toWhatsAppNumber(phone.num) })),
    [telefonos],
  );

  const contactedBlockReason = useMemo(
    () => validateContactedCall({ phones: telefonos, canalContacto, telefonosExplicitEmpty: false }),
    [telefonos, canalContacto],
  );

  const phoneEstadoChange = useCallback((phoneIdx: number, estado: string) => {
    setTelefonos((prev) => prev.map((t, idx) => (idx === phoneIdx ? { ...t, estado } : t)));
  }, []);

  /** Runs `onSave` and normalizes its result; returns the error message (or null). */
  const runSave = async (payload: WizardSavePayload): Promise<string | null> => {
    setSaving(true);
    setFeedback("");
    const result = await onSave(payload);
    setSaving(false);
    if (typeof result === "string") return result;
    setSavedStatus(result && typeof result === "object" ? (result.status ?? null) : null);
    return null;
  };

  const basePayload = () => ({
    telefonos: toSavedPhones(telefonos),
    telefonosDetalle: toTelefonosDetalle(telefonos),
    comentario: comentarioGeneral,
    nuevaDireccion: nuevaDireccion.trim() || null,
  });

  const handleCopyText = async () => {
    const ok = await copyTextToClipboard(resolvedText);
    setCopyStatus(ok ? "ok" : "error");
    setTimeout(() => setCopyStatus("idle"), 2500);
  };

  // Phone list handlers
  const handleToggleFunciona = (phoneIdx: number) => {
    setTelefonos((prev) =>
      prev.map((t, idx) => (idx === phoneIdx ? { ...t, funciona: !t.funciona } : t)),
    );
  };

  const handleSetPrincipal = (phoneIdx: number) => {
    setTelefonos((prev) =>
      prev.map((t, idx) => ({ ...t, principal: idx === phoneIdx })),
    );
  };

  const handlePhoneCommentChange = (phoneIdx: number, comment: string) => {
    setTelefonos((prev) =>
      prev.map((t, idx) => (idx === phoneIdx ? { ...t, comentario: comment } : t)),
    );
  };

  const handleRemovePhone = (phoneIdx: number) => {
    setTelefonos((prev) => {
      const next = prev.filter((_, idx) => idx !== phoneIdx);
      if (next.length && !next.some((t) => t.principal)) {
        next[0].principal = true;
      }
      return next;
    });
  };

  const handleAddPhone = () => {
    const val = newPhoneNum.trim();
    if (!val) return;
    setTelefonos((prev) => [
      ...prev,
      {
        num: val,
        principal: prev.length === 0,
        funciona: true,
        comentario: newPhoneComment.trim(),
      },
    ]);
    setNewPhoneNum("");
    setNewPhoneComment("");
  };

  // Action Bar Handlers
  const handleSaveContacted = async () => {
    const err = await runSave({
      ...basePayload(),
      contactado: true,
      canalContacto,
      fechaPreferenciaEntrega: fechaPreferencia || null,
      solicitudRetorno: false,
    });
    setFeedback(err ?? "✓ Guardada como contactada con éxito");
  };

  const handleOpenNoContact = () => {
    setNoContactError("");
    setShowNoContactConfirm(true);
  };

  const handleConfirmNotContacted = async () => {
    setNoContactError("");
    const err = await runSave({
      ...basePayload(),
      contactado: false,
      canalContacto: null,
      fechaPreferenciaEntrega: fechaPreferencia || null,
      solicitudRetorno: false,
      motivoNoContacto: motivoNoContacto.trim() || null,
    });
    if (err) {
      // Keep the confirmation open so the operator can fix what the API rejected.
      setNoContactError(err);
      return;
    }
    setShowNoContactConfirm(false);
    setFeedback("✓ Marcada como no contactada");
  };

  const handleConfirmTransfer = async () => {
    if (!transferTargetProvince) {
      setFeedback("Selecciona una provincia de destino");
      return;
    }
    const err = await runSave({
      ...basePayload(),
      contactado: false,
      canalContacto,
      fechaPreferenciaEntrega: fechaPreferencia || null,
      trasladoProvincia: transferTargetProvince,
      trasladoMotivo: transferReason.trim() || `Traslado solicitado a ${transferTargetProvince}`,
    });
    setShowTransferModal(false);
    setFeedback(err ?? `✓ Traslado registrado hacia ${transferTargetProvince} y solicitud de extensión generada`);
  };

  const handleConfirmReturn = async () => {
    if (!returnReason.trim()) {
      setFeedback("Indica el motivo de solicitud de retorno");
      return;
    }
    const err = await runSave({
      ...basePayload(),
      contactado: false,
      canalContacto: null,
      fechaPreferenciaEntrega: null,
      solicitudRetorno: true,
      motivoRetorno: returnReason.trim(),
    });
    setShowReturnModal(false);
    setFeedback(err ?? "✓ Solicitud de retorno registrada correctamente");
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP BAR / HEADER */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-3.5 gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f2544] text-sm font-bold text-white shadow-xs">
              {card.nombre
                .split(" ")
                .slice(0, 2)
                .map((w) => w[0])
                .join("")}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-slate-900">{card.nombre}</h2>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  {card.tc}
                </span>
                {card.contactado ? (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    ✓ Contactada
                  </span>
                ) : card.solicitudRetorno ? (
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                    ⚠ Retorno Solicitado
                  </span>
                ) : (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    Pendiente
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cédula: <strong className="text-slate-700">{card.cedula}</strong> · Provincia:{" "}
                <strong className="text-slate-700">{card.provincia}</strong> ({card.zona})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <nav aria-label="Navegación entre tarjetas" className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onPrev}
                disabled={!canPrev}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40"
                title="Tarjeta anterior (←)"
              >
                <ArrowLeft className="h-4 w-4" />
                Anterior
              </button>
              <span className="min-w-[4.5rem] text-center text-xs font-semibold text-slate-600" aria-live="polite">
                {total > 0 ? `${index + 1} de ${total}` : "1 de 1"}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={!canNext}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40"
                title="Tarjeta siguiente (→)"
              >
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </button>
            </nav>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 shadow-2xs"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 3 COLUMNS CONTENT BODY - CENTER COLUMN EXPANDED FOR COMFORT */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_1.35fr_1fr] gap-0 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-slate-100/40">
          {/* ================= COLUMN 1: RELEVANCIA CLIENTE & LOGISTICA ================= */}
          <div className="flex flex-col gap-4 p-5 overflow-y-auto bg-white">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                1
              </span>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-800">
                Información del Cliente & Logística
              </h3>
            </div>

            {/* Datos Personales */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                <span className="text-slate-500">Nombre Titular:</span>
                <span className="font-semibold text-slate-900 text-right">{card.nombre}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                <span className="text-slate-500">Cédula:</span>
                <span className="font-mono font-bold text-slate-800">{card.cedula}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                <span className="text-slate-500">Provincia / Zona:</span>
                <span className="font-semibold text-slate-800">
                  {card.provincia} · {card.zona}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Mensajero Asignado:</span>
                <span className="inline-flex items-center gap-1 rounded bg-slate-200/70 px-2 py-0.5 font-semibold text-slate-800">
                  <Truck className="h-3 w-3 text-slate-600" />
                  {card.mensajero || "Sin asignar"}
                </span>
              </div>
            </div>

            {/* Dirección de Origen */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-700 font-semibold uppercase tracking-wider">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
                Dirección Registrada
              </div>
              <p className="text-slate-700 text-sm leading-relaxed">
                {card.direcciones.length ? card.direcciones.join(" · ") : "Sin dirección registrada"}
              </p>
              {card.refs.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {card.refs.map((ref, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Datos de Agilización / Solicitud */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 text-xs space-y-2">
              <p className="font-bold uppercase tracking-wider text-indigo-900 flex items-center justify-between">
                <span>Datos de Agilización / Envío</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                  {card.status}
                </span>
              </p>
              <div data-testid="client-phones" className="rounded-lg bg-white/70 p-2">
                <span className="text-slate-500 text-[11px]">Teléfonos del cliente:</span>
                <ul className="mt-1.5 space-y-1">
                  {telefonos
                    .filter((phone) => phone.num.trim())
                    .map((phone, idx) => (
                      <li key={idx} className="flex items-center gap-2 font-mono text-base font-bold text-slate-900">
                        <Phone className="h-4 w-4 text-indigo-600" />
                        <span>{formatPhoneDisplay(phone.num)}</span>
                        {phone.principal ? <span className="text-amber-500">★</span> : null}
                      </li>
                    ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="col-span-2">
                  <span className="text-slate-500 text-[11px]">Tipo de producto:</span>
                  <p className="font-bold text-slate-900">
                    {card.productType === "DEBITO" ? "Débito" : card.productType === "CREDITO" ? "Crédito" : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Solicitud / TC:</span>
                  <p className="font-mono font-bold text-slate-900">{card.requestNumber || card.tc}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Presinto:</span>
                  <p className="font-semibold text-slate-800">{card.presinto || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Tipo Emisión:</span>
                  <p className="font-medium text-slate-800">{card.tipoEmision || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">F. Despacho:</span>
                  <p className="font-medium text-slate-800">
                    {card.fechaDespacho
                      ? new Date(card.fechaDespacho).toLocaleDateString("es-DO")
                      : "—"}
                  </p>
                </div>
              </div>
              {card.remaining !== null && card.remaining !== undefined ? (
                <div className="mt-2 rounded-lg bg-rose-100/70 p-2 text-rose-900 flex items-center justify-between font-semibold">
                  <span>SLA Restante:</span>
                  <span>{card.remaining} día(s)</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* ================= COLUMN 2: CAPTACIÓN DE INFORMACIÓN (DESAHOGADA) ================= */}
          <div className="flex flex-col gap-5 p-6 overflow-y-auto bg-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  2
                </span>
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-800">
                  Captación de Información
                </h3>
              </div>
              <span className="text-[11px] font-medium text-slate-400">Edición en tiempo real</span>
            </div>

            {/* SECCIÓN: TABLA DE TELÉFONOS */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700">
                  Números Telefónicos ({telefonos.length})
                </label>
                <span className="text-[11px] text-slate-500">★ Marca el teléfono principal</span>
              </div>

              <div className="space-y-2">
                {/* Headers */}
                <div className="grid grid-cols-12 gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span className="col-span-2 text-center">Funciona</span>
                  <span className="col-span-3">Número</span>
                  <span className="col-span-3">Estado</span>
                  <span className="col-span-4">Nota</span>
                </div>

                {/* Rows */}
                {telefonos.map((t, idx) => (
                  <div
                    key={idx}
                    className={`grid grid-cols-12 items-center gap-2 rounded-xl border p-2 transition-colors ${
                      t.funciona
                        ? "border-emerald-300 bg-emerald-50/60 shadow-2xs"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {/* Col 1: Funciona & Principal */}
                    <div className="col-span-2 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetPrincipal(idx)}
                        title={t.principal ? "Teléfono principal" : "Marcar como principal"}
                        className={`text-base transition-colors ${t.principal ? "text-amber-500 font-bold scale-110" : "text-slate-300 hover:text-slate-400"}`}
                      >
                        ★
                      </button>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={t.funciona}
                          onChange={() => handleToggleFunciona(idx)}
                          className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-700">
                          {t.funciona ? "Sí" : "No"}
                        </span>
                      </label>
                    </div>

                    {/* Col 2: Número */}
                    <div className="col-span-3">
                      <input
                        type="text"
                        aria-label={`Número ${idx + 1}`}
                        value={t.num}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTelefonos((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, num: val } : item)),
                          );
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:outline-hidden"
                        placeholder="8090000000"
                      />
                    </div>

                    {/* Col 3: Estado de la llamada a este número */}
                    <div className="col-span-3">
                      <PhoneEstadoSelect
                        value={t.estado || ""}
                        onChange={(next) => phoneEstadoChange(idx, next)}
                        label={`Estado del número ${t.num || idx + 1}`}
                      />
                    </div>

                    {/* Col 4: Comentario individual */}
                    <div className="col-span-4 flex items-center gap-1.5">
                      <input
                        type="text"
                        aria-label={`Nota del número ${t.num || idx + 1}`}
                        value={t.comentario || ""}
                        onChange={(e) => handlePhoneCommentChange(idx, e.target.value)}
                        placeholder="Ej: Apagado, no contesta..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhone(idx)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="Eliminar número"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Agregar nuevo número */}
                <div className="grid grid-cols-12 gap-2 rounded-xl border border-dashed border-slate-300 p-2.5 bg-white">
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={newPhoneNum}
                      onChange={(e) => setNewPhoneNum(e.target.value)}
                      placeholder="+ Nuevo número..."
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-slate-800 focus:outline-hidden"
                    />
                  </div>
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={newPhoneComment}
                      onChange={(e) => setNewPhoneComment(e.target.value)}
                      placeholder="Nota rápida..."
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-slate-800 focus:outline-hidden"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddPhone();
                        }
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={handleAddPhone}
                      className="w-full rounded-lg bg-slate-900 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN: CANAL DE CONTACTO EFECTIVO */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <label className="mb-2.5 block text-xs font-bold uppercase tracking-wide text-slate-700">
                ¿Dónde se realizó el contacto efectivo?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={canalContacto === "WHATSAPP"}
                  onClick={() => setCanalContacto((prev) => (prev === "WHATSAPP" ? null : "WHATSAPP"))}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 px-4 text-xs font-bold transition-all ${
                    canalContacto === "WHATSAPP"
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/20"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  aria-pressed={canalContacto === "LLAMADA_DIRECTA"}
                  onClick={() =>
                    setCanalContacto((prev) => (prev === "LLAMADA_DIRECTA" ? null : "LLAMADA_DIRECTA"))
                  }
                  className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 px-4 text-xs font-bold transition-all ${
                    canalContacto === "LLAMADA_DIRECTA"
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <Phone className="h-4 w-4" />
                  <span>Llamada Directa</span>
                </button>
              </div>
            </div>

            {/* SECCIÓN: NUEVA DIRECCIÓN DE ENTREGA (CONFIRMADA) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-700">
                Nueva Dirección de Entrega (Confirmada)
              </label>
              <textarea
                value={nuevaDireccion}
                onChange={(e) => setNuevaDireccion(e.target.value)}
                rows={3}
                placeholder="Indica la dirección confirmada o actualizada por el cliente..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:outline-hidden leading-relaxed"
              />
            </div>

            {/* SECCIÓN: FECHA DE PREFERENCIA Y OBSERVACIONES */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-700">
                  Fecha de Preferencia de Entrega <span className="text-slate-400 font-normal">(Si aplica)</span>
                </label>
                <input
                  type="date"
                  value={fechaPreferencia}
                  onChange={(e) => setFechaPreferencia(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-700">
                  Observaciones Generales de la Llamada
                </label>
                <textarea
                  value={comentarioGeneral}
                  onChange={(e) => setComentarioGeneral(e.target.value)}
                  rows={3}
                  placeholder="Horario específico, persona autorizada a recibir, referencias extras..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:outline-hidden leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* ================= COLUMN 3: GUIÓN DE COMUNICACIÓN DINÁMICO ================= */}
          <div className="flex flex-col gap-4 p-5 overflow-y-auto bg-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                  3
                </span>
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-800">
                  Guión de Comunicación
                </h3>
              </div>

              <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setScriptTab("SPEECH")}
                  className={`px-2 py-1 rounded-md transition-all ${
                    scriptTab === "SPEECH"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Speech Llamada
                </button>
                <button
                  type="button"
                  onClick={() => setScriptTab("WHATSAPP")}
                  className={`px-2 py-1 rounded-md transition-all ${
                    scriptTab === "WHATSAPP"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  WhatsApp
                </button>
              </div>
            </div>

            {/* Cuadro de Speech / Mensaje personalizado */}
            <div className="relative flex-1 flex flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-2xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 text-xs text-slate-500 font-medium">
                <span>Variables dinámicas aplicadas</span>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all shadow-2xs"
                >
                  {copyStatus === "ok" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">¡Copiado!</span>
                    </>
                  ) : copyStatus === "error" ? (
                    <>
                      <X className="h-3.5 w-3.5 text-rose-600" />
                      <span className="text-rose-700">No se pudo copiar el mensaje</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-600" />
                      Copiar mensaje
                    </>
                  )}
                </button>
              </div>

              <div className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 font-sans select-text overflow-y-auto">
                {resolvedText}
              </div>

              {scriptTab === "WHATSAPP" ? (
                <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-2" data-testid="whatsapp-contacts">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Enviar por WhatsApp
                  </p>
                  {whatsappTargets.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Sin teléfonos para contactar</p>
                  ) : null}
                  {whatsappTargets.map(({ num, target }, idx) => (
                    <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-800">{formatPhoneDisplay(num)}</span>
                      {target.ok ? (
                        <a
                          href={buildWhatsAppUrl(target.number, whatsappText)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Contactar
                        </a>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] text-rose-700">{target.reason}</span>
                          <button
                            type="button"
                            disabled
                            title={target.reason}
                            className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-bold text-slate-500 opacity-60"
                          >
                            Contactar
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                <span>💡 Puedes modificar esta plantilla en Configuración.</span>
                <span className="font-mono text-slate-400">TC {card.tc}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= FIXED BOTTOM ACTION BAR ================= */}
        <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between border-t border-slate-200 bg-white/95 backdrop-blur-md px-6 py-3 shadow-lg gap-3">
          <div className="flex items-center gap-3">
            {feedback ? (
              <span
                className={`rounded-xl px-3 py-1.5 text-xs font-bold border ${
                  feedback.startsWith("✓") || feedback.toLowerCase().includes("éxito")
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}
              >
                {feedback}
              </span>
            ) : null}
            {savedStatus ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                Estado actual: <StatusBadge value={savedStatus} />
              </span>
            ) : null}
            {saving ? (
              <span className="text-xs font-semibold text-slate-500 animate-pulse">
                Procesando cambios...
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Asignar a grupo (Stage B, Task B3) */}
            {canManageGroups && card.cardId ? (
              <div className="flex items-center gap-2">
                {memberOfGroups.length ? (
                  <span className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                    En grupo:
                    {memberOfGroups.map((group) => (
                      <span
                        key={group.id}
                        className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-700"
                      >
                        {group.name}
                      </span>
                    ))}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setGroupModalOpen(true)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Asignar a grupo
                </button>
              </div>
            ) : null}

            {/* Solicitar Retorno */}
            <button
              type="button"
              onClick={() => setShowReturnModal(true)}
              disabled={saving}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 transition-all disabled:opacity-50"
            >
              ⚠ Solicitar Retorno
            </button>

            {/* Traslado a otra provincia */}
            <button
              type="button"
              onClick={() => setShowTransferModal(true)}
              disabled={saving}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Entregar en otra provincia
            </button>

            {/* Marcar No Contactada */}
            <button
              type="button"
              onClick={handleOpenNoContact}
              disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
            >
              Marcar No Contactada
            </button>

            {/* Marcar Contactada */}
            {contactedBlockReason ? (
              <span className="max-w-xs text-[11px] font-semibold text-amber-700" role="status">
                {contactedBlockReason}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleSaveContacted}
              disabled={saving || contactedBlockReason !== null}
              title={contactedBlockReason ?? undefined}
              className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="h-4 w-4" />
              ✓ Marcar Contactada
            </button>
          </div>
        </div>

        {/* MODAL ASIGNAR A GRUPO (Stage B, Task B3) */}
        {groupModalOpen && card.cardId ? (
          <CardGroupAssignModal
            cardIds={[card.cardId]}
            /* 0, not the undeterminable state: the operator named exactly ONE
               card explicitly, so there is no filter to fall outside of. The
               question is answered by construction, and 0 renders no banner -
               which is right, since warning "some may fall outside this view"
               about a card the operator is looking at would be false. */
            offFilterCount={0}
            groups={cardGroups}
            onClose={() => setGroupModalOpen(false)}
            onSuccess={() => {
              setGroupModalOpen(false);
              onGroupsChanged?.();
            }}
          />
        ) : null}

        {/* CONFIRMACIÓN NO CONTACTADA */}
        {showNoContactConfirm ? (
          <NoContactConfirm
            phones={telefonos}
            motivo={motivoNoContacto}
            saving={saving}
            error={noContactError}
            onEstadoChange={phoneEstadoChange}
            onNotaChange={handlePhoneCommentChange}
            onMotivoChange={setMotivoNoContacto}
            onCancel={() => setShowNoContactConfirm(false)}
            onConfirm={() => void handleConfirmNotContacted()}
          />
        ) : null}

        {/* MODAL TRASLADO A OTRA PROVINCIA */}
        {showTransferModal ? (
          <div
            className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowTransferModal(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Trasladar Entrega a Otra Provincia
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="rounded p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <p className="text-slate-600">
                  Esta acción moverá la tarjeta al apartado de <strong>Traslados</strong> y generará
                  automáticamente una <strong>Solicitud de Extensión de SLA</strong> para el Banco.
                </p>

                <div>
                  <label className="mb-1 block font-bold text-slate-700">
                    Provincia de Destino <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={transferTargetProvince}
                    onChange={(e) => setTransferTargetProvince(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="">Selecciona la provincia destino...</option>
                    {provincesList
                      .filter((p) => p !== card.provincia)
                      .map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-bold text-slate-700">Motivo del Traslado</label>
                  <input
                    type="text"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="Ej: Cliente reside o labora en Santiago temporalmente"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmTransfer}
                  disabled={saving || !transferTargetProvince}
                  className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:opacity-40"
                >
                  Confirmar Traslado
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* MODAL SOLICITAR RETORNO */}
        {showReturnModal ? (
          <div
            className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowReturnModal(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-display text-base font-bold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                  Solicitar Retorno de Tarjeta
                </h3>
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="rounded p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <p className="text-slate-600">
                  Registra la solicitud de retorno para esta tarjeta no contactada o rechazada por el
                  cliente para su posterior devolución.
                </p>

                <div>
                  <label className="mb-1 block font-bold text-slate-700">
                    Motivo de Retorno <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    rows={3}
                    placeholder="Ej: Números apagados en múltiples intentos / Cliente cancela solicitud"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReturn}
                  disabled={saving || !returnReason.trim()}
                  className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-40"
                >
                  Confirmar Retorno
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
