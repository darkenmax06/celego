"use client";

import { useMemo } from "react";
import { Clock, CreditCard, Phone, Truck, User, UserCheck, PhoneCall, Package } from "lucide-react";
import { usePersistentState } from "@/lib/use-persistent-state";
import { slaSummary, type SlaSummaryTone } from "@/lib/sla-summary";
import { CollapsibleSection } from "./collapsible-section";
import { Field, FieldGrid, orDash, EMPTY_VALUE } from "./field-grid";
import { SummaryStrip, SummaryTile } from "./summary-strip";
import {
  ContactChannelLabel,
  ContactManagementPanel,
  ContactStateBadge,
  type OperativoMetadata,
} from "./contact-management";

export type CardInfoData = {
  zona: string;
  provincia: string;
  isRemote: boolean;
  dispatchDate: string | null;
  dispatchOrigin: "TORRE_POPULAR" | "CENTRO_ACOPIO" | "BPD_DEBITO" | null;
  deliveryType: string | null;
  emissionType: string | null;
  supplier: string | null;
  contractType: string | null;
  externalReference: string | null;
  reassignedProvince: string | null;
  reassignedZone: string | null;
  isAdditional: boolean;
  additionalIndex: number;
  urgent: boolean;
  slaDueDate: string | null;
  customer: { cedula: string };
  currentMessenger: { nombre: string } | null;
  reassignedMessenger: { nombre: string } | null;
  activeUrgentCase: { level: number } | null;
};

export const SECTION_KEYS = ["cliente", "tarjeta", "despacho", "sla", "contacto"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type SectionState = Record<SectionKey, boolean>;

export const DEFAULT_SECTION_STATE: SectionState = {
  cliente: true,
  tarjeta: false,
  despacho: false,
  sla: false,
  contacto: true,
};

export const SECTION_STORAGE_KEY = "card-detail:info-sections";

export function urgencyLabel(level: number) {
  if (level === 5) return "Nivel 5 (Extremadamente urgente)";
  if (level === 4) return "Nivel 4 (Muy urgente)";
  if (level === 3) return "Nivel 3 (Alta)";
  if (level === 2) return "Nivel 2 (Moderada)";
  return "Nivel 1 (Leve)";
}

export function cardTypeLabel(card: Pick<CardInfoData, "isAdditional" | "additionalIndex">) {
  return card.isAdditional ? `Adicional #${card.additionalIndex}` : "Principal";
}

function dispatchOriginLabel(origin: CardInfoData["dispatchOrigin"]) {
  if (origin === "CENTRO_ACOPIO") return "Centro de acopio";
  if (origin === "TORRE_POPULAR") return "Torre Popular";
  if (origin === "BPD_DEBITO") return "BPD Débito";
  return "Sin procedencia";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("es-DO") : EMPTY_VALUE;
}

const SLA_TONE_CLASS: Record<SlaSummaryTone, string> = {
  danger: "text-rose-700",
  warning: "text-amber-700",
  neutral: "text-slate-900",
  muted: "text-slate-700",
};

type Props = {
  card: CardInfoData;
  operativo: OperativoMetadata | null;
  addressLines: string[];
  referenceList: string[];
  phoneList: string[];
  /** Closed/terminal cards show the SLA date without urgency color. */
  isClosed: boolean;
  onOpenContactWizard: () => void;
  now?: Date;
};

/** Presentational "Informacion" tab: summary strip plus collapsible sections. */
export function CardInfoTab({
  card,
  operativo,
  addressLines,
  referenceList,
  phoneList,
  isClosed,
  onOpenContactWizard,
  now,
}: Props) {
  const [sections, setSections] = usePersistentState<SectionState>(SECTION_STORAGE_KEY, DEFAULT_SECTION_STATE);
  const isOpen = (key: SectionKey) => sections?.[key] ?? DEFAULT_SECTION_STATE[key];
  const toggle = (key: SectionKey) =>
    setSections((current) => ({ ...DEFAULT_SECTION_STATE, ...current, [key]: !(current?.[key] ?? DEFAULT_SECTION_STATE[key]) }));

  const sla = useMemo(() => slaSummary(card.slaDueDate, now ?? new Date(), isClosed), [card.slaDueDate, now, isClosed]);
  const effectiveMessenger = card.reassignedMessenger?.nombre || card.currentMessenger?.nombre || null;
  const urgentBadge = card.urgent ? (
    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
      {card.activeUrgentCase ? `Urgente N${card.activeUrgentCase.level}` : "Urgente"}
    </span>
  ) : null;

  return (
    <div className="space-y-4">
      <SummaryStrip>
        <SummaryTile label="SLA" icon={Clock} badge={urgentBadge} hint={sla.dateLabel}>
          <span className={SLA_TONE_CLASS[sla.tone]}>{sla.label}</span>
        </SummaryTile>
        <SummaryTile
          label="Mensajero"
          icon={UserCheck}
          hint={card.reassignedMessenger?.nombre ? "reasignado" : null}
        >
          {effectiveMessenger ?? <span className="font-normal text-slate-500">Sin asignar</span>}
        </SummaryTile>
        <SummaryTile
          label="Contacto"
          icon={PhoneCall}
          hint={
            <span className="flex items-center gap-1">
              <ContactChannelLabel operativo={operativo} />
            </span>
          }
        >
          <ContactStateBadge operativo={operativo} />
        </SummaryTile>
        <SummaryTile label="Despacho" icon={Package} hint={dispatchOriginLabel(card.dispatchOrigin)}>
          {formatDate(card.dispatchDate)}
        </SummaryTile>
      </SummaryStrip>

      <CollapsibleSection title="Cliente y dirección" icon={User} open={isOpen("cliente")} onToggle={() => toggle("cliente")}>
        <FieldGrid>
          <Field label="Cédula">{orDash(card.customer.cedula)}</Field>
          <Field label="Provincia">{orDash(card.provincia)}</Field>
          <Field label="Zona">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {orDash(card.zona)}
              {card.isRemote ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Remota
                </span>
              ) : null}
            </span>
          </Field>
          <Field label="Dirección completa" wide>
            {addressLines.length ? (
              <div className="mt-1 space-y-1 rounded-xl bg-slate-50 p-3 font-normal text-slate-700">
                {addressLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : (
              EMPTY_VALUE
            )}
          </Field>
          <Field label="Teléfonos registrados" wide>
            {phoneList.length ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {phoneList.map((phone) => (
                  <span key={phone} className="rounded-lg bg-slate-50 px-3 py-1.5 font-mono text-sm text-slate-800">
                    {phone}
                  </span>
                ))}
              </div>
            ) : (
              <span className="font-normal text-slate-500">Sin telefonos cargados.</span>
            )}
          </Field>
        </FieldGrid>
      </CollapsibleSection>

      <CollapsibleSection title="Datos de la tarjeta" icon={CreditCard} open={isOpen("tarjeta")} onToggle={() => toggle("tarjeta")}>
        <FieldGrid>
          <Field label="Tipo">{cardTypeLabel(card)}</Field>
          <Field label="Tipo de emisión">{orDash(card.emissionType)}</Field>
          <Field label="Contrato">{orDash(card.contractType)}</Field>
          <Field label="Referencia" wide={referenceList.length > 1}>
            {referenceList.length > 1 ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {referenceList.map((ref) => (
                  <span key={ref} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {ref}
                  </span>
                ))}
              </div>
            ) : (
              orDash(card.externalReference)
            )}
          </Field>
        </FieldGrid>
      </CollapsibleSection>

      <CollapsibleSection title="Despacho y logística" icon={Truck} open={isOpen("despacho")} onToggle={() => toggle("despacho")}>
        <FieldGrid>
          <Field label="Fecha de despacho">{formatDate(card.dispatchDate)}</Field>
          <Field label="Origen de despacho">{dispatchOriginLabel(card.dispatchOrigin)}</Field>
          <Field label="Suplidor">{orDash(card.supplier)}</Field>
          <Field label="Tipo de entrega">{orDash(card.deliveryType)}</Field>
          <Field label="Mensajero">{orDash(card.currentMessenger?.nombre)}</Field>
          <Field label="Mensajero reasignado">{orDash(card.reassignedMessenger?.nombre)}</Field>
          <Field label="Provincia de reasignación">{orDash(card.reassignedProvince)}</Field>
          <Field label="Zona facturable">{orDash(card.reassignedZone || card.zona)}</Field>
        </FieldGrid>
      </CollapsibleSection>

      <CollapsibleSection title="SLA y urgencia" icon={Clock} open={isOpen("sla")} onToggle={() => toggle("sla")}>
        <FieldGrid>
          <Field label="Fecha SLA">{formatDate(card.slaDueDate)}</Field>
          <Field label="Urgente">{card.urgent ? "Sí" : "No"}</Field>
          <Field label="Nivel de urgencia">
            {card.activeUrgentCase ? urgencyLabel(card.activeUrgentCase.level) : EMPTY_VALUE}
          </Field>
        </FieldGrid>
      </CollapsibleSection>

      <CollapsibleSection title="Gestión de contacto" icon={Phone} open={isOpen("contacto")} onToggle={() => toggle("contacto")}>
        <ContactManagementPanel operativo={operativo} onOpenWizard={onOpenContactWizard} />
      </CollapsibleSection>
    </div>
  );
}
