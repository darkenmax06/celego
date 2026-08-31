"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check, Phone, MessageSquare, MapPin, Send, ArrowLeft, ArrowRight, X, AlertTriangle, Truck } from "lucide-react";

export type PhoneState = {
  num: string;
  principal: boolean;
  funciona: boolean;
  comentario?: string;
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
  tipoEmision?: string | null;
  tipoEntrega?: string | null;
  direcciones: string[];
  refs: string[];
  mensajero?: string;
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
  readOnly?: boolean;
};

type Props = {
  card: OperativeWizardCard;
  index: number;
  total: number;
  provincesList?: string[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSave: (payload: {
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
  }) => Promise<string | null>;
};

const DEFAULT_SCRIPT =
  "Hola {{name}}, le saludamos del equipo de entrega de tarjetas. Nos comunicamos para coordinar la entrega de su tarjeta con terminación {{tc}} (Cédula: {{cedula}}) en la dirección registrada: {{direccion}}, {{provincia}}. Por favor confírmenos si se encuentra en dicha dirección o si prefiere coordinar un día u horario de preferencia. ¡Muchas gracias!";

const DEFAULT_WHATSAPP =
  "¡Hola {{name}}! 👋 Le escribimos del departamento de entrega y logística. Le contactamos para coordinar la entrega de su tarjeta terminación *{{tc}}*.\n\n📍 *Dirección registrada:* {{direccion}}, {{provincia}}\n👤 *Titular:* {{name}} (Cédula: {{cedula}})\n\n¿Se encuentra disponible para recibirla o desea indicar una fecha/horario de su preferencia?";

function formatPhoneDisplay(num: string) {
  const digits = num.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return num;
}

export function OperativeContactWizard({
  card,
  index,
  total,
  provincesList = [],
  onClose,
  onPrev,
  onNext,
  onSave,
}: Props) {
  // Column 2 state
  const [telefonos, setTelefonos] = useState<PhoneState[]>([]);
  const [newPhoneNum, setNewPhoneNum] = useState("");
  const [newPhoneComment, setNewPhoneComment] = useState("");
  const [canalContacto, setCanalContacto] = useState<"WHATSAPP" | "LLAMADA_DIRECTA" | null>(null);
  const [nuevaDireccion, setNuevaDireccion] = useState("");
  const [fechaPreferencia, setFechaPreferencia] = useState("");
  const [comentarioGeneral, setComentarioGeneral] = useState("");

  // Column 3 state (Script & WhatsApp template)
  const [scriptTemplate, setScriptTemplate] = useState(DEFAULT_SCRIPT);
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP);
  const [scriptTab, setScriptTab] = useState<"SPEECH" | "WHATSAPP">("SPEECH");
  const [copied, setCopied] = useState(false);

  // Modals inside wizard
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetProvince, setTransferTargetProvince] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  // Save states
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

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

  // Initialize card data
  useEffect(() => {
    const basePhones = card.telefonos && card.telefonos.length > 0
      ? card.telefonos.map((t) => ({ ...t, comentario: t.comentario || "" }))
      : [{ num: "", principal: true, funciona: false, comentario: "" }];

    setTelefonos(basePhones);
    setCanalContacto(card.canalContacto || null);
    setNuevaDireccion(card.nuevaDireccion || "");
    setFechaPreferencia(card.fechaPreferenciaEntrega || "");
    setComentarioGeneral(card.comentarioContacto || "");
    setTransferTargetProvince("");
    setTransferReason("");
    setReturnReason(card.motivoRetorno || "");
    setFeedback("");
  }, [card]);

  // Keyboard navigation & ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showTransferModal && !showReturnModal) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, showTransferModal, showReturnModal]);

  // Resolved dynamic text for Column 3
  const principalPhone = useMemo(() => {
    return telefonos.find((t) => t.principal)?.num || telefonos[0]?.num || "-";
  }, [telefonos]);

  const resolvedText = useMemo(() => {
    const activeTemplate = scriptTab === "WHATSAPP" ? whatsappTemplate : scriptTemplate;
    return activeTemplate
      .replaceAll("{{name}}", card.nombre)
      .replaceAll("{{cedula}}", card.cedula)
      .replaceAll("{{tc}}", card.tc)
      .replaceAll("{{provincia}}", card.provincia)
      .replaceAll("{{zona}}", card.zona)
      .replaceAll("{{direccion}}", nuevaDireccion || card.direcciones.join(" · ") || "No especificada")
      .replaceAll("{{mensajero}}", card.mensajero || "Sin asignar")
      .replaceAll("{{solicitud}}", card.requestNumber || card.tipoEmision || "N/A")
      .replaceAll("{{telefono_principal}}", principalPhone);
  }, [
    scriptTab,
    scriptTemplate,
    whatsappTemplate,
    card,
    nuevaDireccion,
    principalPhone,
  ]);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(resolvedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback("No se pudo copiar automáticamente");
    }
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
    setSaving(true);
    setFeedback("");
    const validPhones = telefonos.filter((t) => t.num && t.num.trim().length >= 3);
    const err = await onSave({
      telefonos: validPhones,
      comentario: comentarioGeneral,
      contactado: true,
      canalContacto,
      nuevaDireccion: nuevaDireccion.trim() || null,
      fechaPreferenciaEntrega: fechaPreferencia || null,
      solicitudRetorno: false,
    });
    setSaving(false);
    if (err) {
      setFeedback(err);
    } else {
      setFeedback("✓ Guardada como contactada con éxito");
    }
  };

  const handleSaveNotContacted = async () => {
    setSaving(true);
    setFeedback("");
    const validPhones = telefonos.filter((t) => t.num && t.num.trim().length >= 3);
    const err = await onSave({
      telefonos: validPhones,
      comentario: comentarioGeneral,
      contactado: false,
      canalContacto: null,
      nuevaDireccion: nuevaDireccion.trim() || null,
      fechaPreferenciaEntrega: fechaPreferencia || null,
      solicitudRetorno: false,
    });
    setSaving(false);
    if (err) {
      setFeedback(err);
    } else {
      setFeedback("✓ Marcada como no contactada");
    }
  };

  const handleConfirmTransfer = async () => {
    if (!transferTargetProvince) {
      setFeedback("Selecciona una provincia de destino");
      return;
    }
    setSaving(true);
    setFeedback("");
    const validPhones = telefonos.filter((t) => t.num && t.num.trim().length >= 3);
    const err = await onSave({
      telefonos: validPhones,
      comentario: comentarioGeneral,
      contactado: false,
      canalContacto,
      nuevaDireccion: nuevaDireccion.trim() || null,
      fechaPreferenciaEntrega: fechaPreferencia || null,
      trasladoProvincia: transferTargetProvince,
      trasladoMotivo: transferReason.trim() || `Traslado solicitado a ${transferTargetProvince}`,
    });
    setSaving(false);
    setShowTransferModal(false);
    if (err) {
      setFeedback(err);
    } else {
      setFeedback(`✓ Traslado registrado hacia ${transferTargetProvince} y solicitud de extensión generada`);
    }
  };

  const handleConfirmReturn = async () => {
    if (!returnReason.trim()) {
      setFeedback("Indica el motivo de solicitud de retorno");
      return;
    }
    setSaving(true);
    setFeedback("");
    const validPhones = telefonos.filter((t) => t.num && t.num.trim().length >= 3);
    const err = await onSave({
      telefonos: validPhones,
      comentario: comentarioGeneral,
      contactado: false,
      canalContacto: null,
      nuevaDireccion: nuevaDireccion.trim() || null,
      fechaPreferenciaEntrega: null,
      solicitudRetorno: true,
      motivoRetorno: returnReason.trim(),
    });
    setSaving(false);
    setShowReturnModal(false);
    if (err) {
      setFeedback(err);
    } else {
      setFeedback("✓ Solicitud de retorno registrada correctamente");
    }
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
            <div className="flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 border border-slate-200 text-xs font-semibold text-slate-600 shadow-2xs">
              <span>
                {index + 1} de {total}
              </span>
              <div className="flex items-center ml-2 border-l border-slate-200 pl-2 gap-1">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={index <= 0}
                  className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                  title="Anterior tarjeta"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={index >= total - 1}
                  className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                  title="Siguiente tarjeta"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 shadow-2xs"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 3 COLUMNS CONTENT BODY - CENTER COLUMN EXPANDED FOR COMFORT */}
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_1.35fr_1fr] gap-0 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-slate-100/40 pb-20">
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
              <div className="grid grid-cols-2 gap-2 pt-1">
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
                  <span className="col-span-3 text-center">Funciona</span>
                  <span className="col-span-4">Número</span>
                  <span className="col-span-5">Nota / Estado</span>
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
                    <div className="col-span-3 flex items-center justify-center gap-2">
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
                    <div className="col-span-4">
                      <input
                        type="text"
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

                    {/* Col 3: Comentario individual */}
                    <div className="col-span-5 flex items-center gap-1.5">
                      <input
                        type="text"
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
                  onClick={() => setCanalContacto("WHATSAPP")}
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
                  onClick={() => setCanalContacto("LLAMADA_DIRECTA")}
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
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado!</span>
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

              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                <span>💡 Puedes modificar esta plantilla en Configuración.</span>
                <span className="font-mono text-slate-400">TC {card.tc}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= FIXED BOTTOM ACTION BAR ================= */}
        <div className="absolute bottom-0 inset-x-0 z-20 flex flex-wrap items-center justify-between border-t border-slate-200 bg-white/95 backdrop-blur-md px-6 py-3 shadow-lg gap-3">
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
            {saving ? (
              <span className="text-xs font-semibold text-slate-500 animate-pulse">
                Procesando cambios...
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              onClick={handleSaveNotContacted}
              disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
            >
              Marcar No Contactada
            </button>

            {/* Marcar Contactada */}
            <button
              type="button"
              onClick={handleSaveContacted}
              disabled={saving}
              className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="h-4 w-4" />
              ✓ Marcar Contactada
            </button>
          </div>
        </div>

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
