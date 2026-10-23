import { CardStatus, Prisma } from "@prisma/client";
import { remainingBusinessDays } from "@/lib/sla";
import { normalizeText } from "@/lib/utils";
import { clampUrgencyLevel, urgencyIntervalMinutes, urgencyLevelLabel } from "@/lib/urgent-alerts";
import { toAsignadoA } from "@/lib/call-assignment";

/**
 * Operativo row mapping shared by `/api/operativo/contacto` and the call
 * assignment APIs (`/api/llamadas/*`). Extracted verbatim from the contact
 * route; behaviour must stay identical across both consumers.
 */

export type PhoneState = {
  num: string;
  principal: boolean;
  funciona: boolean;
  comentario?: string;
};

export type OperativoCardInput = {
  id: string;
  tc: string;
  requestNumber: string | null;
  externalReference: string | null;
  zona: string;
  provincia: string;
  dispatchDate: Date | null;
  deliveryType: string | null;
  emissionType: string | null;
  status: CardStatus;
  urgent: boolean;
  slaDueDate: Date | null;
  metadata: Prisma.JsonValue | null;
  customer: {
    nombre: string;
    cedula: string;
    direccionRaw: string | null;
    telefonosRaw: string | null;
  };
  currentMessenger?: {
    nombre: string;
    telefono?: string | null;
  } | null;
  /** Calls overhaul: optional so legacy selects without the relation still map. */
  callAssignment?: { assignedTo: { id: string; name: string } | null } | null;
  /** Calls overhaul: total call attempts (optional so selects without `_count` still map). */
  _count?: { contacts: number } | null;
  contacts: Array<{
    comentario: string | null;
    contactado: boolean;
    telefonosUsados: string | null;
  }>;
  /** Card groups: optional so selects without the relation still map (to no groups). */
  groupMemberships?: Array<{ groupId: string }>;
};

export type ActiveUrgentCaseSnapshot = {
  id: string;
  level: number;
  lastNotifiedAt: Date | null;
  nextNotificationAt: Date | null;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function splitTextChunks(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(/[\n;|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitPhonesFromRaw(raw: string | null | undefined) {
  if (!raw) return [];
  const numbers = raw.match(/\d{7,}/g) ?? [];
  return [...new Set(numbers)];
}

export function normalizeStatusKey(value: string) {
  return normalizeText(value).replace(/[\s-]+/g, "_");
}

export function matchesStatusFilter(status: string, filter: string | null) {
  if (!filter || filter === "ALL") return true;
  return normalizeStatusKey(status) === normalizeStatusKey(filter);
}

export function parseCardStatusFilter(filter: string | null) {
  if (!filter || filter === "ALL") return "ALL" as const;
  if ((Object.values(CardStatus) as string[]).includes(filter)) {
    return filter as CardStatus;
  }
  return null;
}

export function normalizePhoneValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const compact = trimmed.replace(/[^\d+]/g, "");
  return compact || trimmed;
}

export function normalizePhones(
  rawPhones: Array<{ num: string; principal?: boolean; funciona?: boolean; comentario?: string }>,
): PhoneState[] {
  const deduped: PhoneState[] = [];
  const seen = new Set<string>();

  for (const item of rawPhones) {
    const num = normalizePhoneValue(item.num);
    if (!num) continue;

    const key = num.replace(/\D/g, "") || num.toUpperCase();
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push({
      num,
      principal: Boolean(item.principal),
      funciona: Boolean(item.funciona),
      comentario: item.comentario?.trim() || "",
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

export function phonesSignature(phones: PhoneState[]) {
  return phones
    .map(
      (phone) =>
        `${phone.num}|${phone.principal ? 1 : 0}|${phone.funciona ? 1 : 0}|${phone.comentario || ""}`,
    )
    .join(";");
}

export function parseMetadataPhones(metadata: Record<string, unknown>): PhoneState[] {
  const raw = metadata.telefonos;
  if (!Array.isArray(raw)) return [];

  const parsed: PhoneState[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      parsed.push({ num: item, principal: false, funciona: false, comentario: "" });
    } else if (item && typeof item === "object") {
      const obj = asRecord(item);
      if (typeof obj.num === "string") {
        parsed.push({
          num: obj.num,
          principal: Boolean(obj.principal),
          funciona: Boolean(obj.funciona),
          comentario: typeof obj.comentario === "string" ? obj.comentario : "",
        });
      }
    }
  }

  return normalizePhones(parsed);
}

export function mapCardToOperativeRow(
  card: OperativoCardInput,
  activeUrgentCase?: ActiveUrgentCaseSnapshot | null,
) {
  const root = asRecord(card.metadata);
  const operativo = asRecord(root.operativo);
  const latestContact = card.contacts[0] ?? null;

  const metaPhones = parseMetadataPhones(operativo);
  const fallbackPhones = normalizePhones(
    splitPhonesFromRaw(card.customer.telefonosRaw).map((num, index) => ({
      num,
      principal: index === 0,
      funciona: false,
      comentario: "",
    })),
  );
  const contactPhones =
    metaPhones.length > 0
      ? metaPhones
      : latestContact?.telefonosUsados
        ? normalizePhones(
            latestContact.telefonosUsados.split(/[,\n;]+/g).map((num, index) => ({
              num,
              principal: index === 0,
              funciona: false,
              comentario: "",
            })),
          )
        : fallbackPhones;

  const contactado =
    typeof operativo.contactado === "boolean"
      ? operativo.contactado
      : (latestContact?.contactado ?? false);

  const comentarioContacto =
    typeof operativo.comentarioContacto === "string"
      ? operativo.comentarioContacto
      : (latestContact?.comentario ?? "");

  const presinto = typeof root.presinto === "string" ? root.presinto : null;
  const level = activeUrgentCase ? clampUrgencyLevel(activeUrgentCase.level) : card.urgent ? 3 : null;
  const intervalMinutes = level ? urgencyIntervalMinutes(level) : null;

  return {
    id: card.id,
    cardId: card.id,
    urgentCaseId: activeUrgentCase?.id ?? null,
    tc: card.tc,
    requestNumber: card.requestNumber ?? (typeof root.solicitud === "string" ? root.solicitud : null),
    nombre: card.customer.nombre,
    cedula: card.customer.cedula,
    provincia: card.provincia,
    zona: card.zona,
    status: card.status,
    urgent: card.urgent,
    urgentLevel: level,
    urgentLabel: level ? urgencyLevelLabel(level) : null,
    urgentIntervalMinutes: intervalMinutes,
    urgentNextNotificationAt: activeUrgentCase?.nextNotificationAt?.toISOString() ?? null,
    urgentLastNotificationAt: activeUrgentCase?.lastNotifiedAt?.toISOString() ?? null,
    remaining: card.slaDueDate ? remainingBusinessDays(new Date(), card.slaDueDate) : null,
    presinto,
    fechaDespacho: card.dispatchDate?.toISOString() ?? null,
    slaDueDate: card.slaDueDate?.toISOString() ?? null,
    tipoEmision: card.emissionType,
    tipoEntrega: card.deliveryType,
    direcciones: splitTextChunks(card.customer.direccionRaw),
    refs: splitTextChunks(card.externalReference),
    mensajero: card.currentMessenger?.nombre ?? "Sin asignar",
    mensajeroTelefono: card.currentMessenger?.telefono ?? null,
    asignadoA: toAsignadoA(card.callAssignment),
    attempts: card._count?.contacts ?? null,
    telefonos: contactPhones,
    comentarioContacto,
    contactado,
    canalContacto: (typeof operativo.canalContacto === "string" ? operativo.canalContacto : null) as
      | "WHATSAPP"
      | "LLAMADA_DIRECTA"
      | null,
    nuevaDireccion: contactado && typeof operativo.nuevaDireccion === "string" ? operativo.nuevaDireccion : null,
    fechaPreferenciaEntrega:
      typeof operativo.fechaPreferenciaEntrega === "string" ? operativo.fechaPreferenciaEntrega : null,
    solicitudRetorno: Boolean(operativo.solicitudRetorno),
    motivoRetorno: typeof operativo.motivoRetorno === "string" ? operativo.motivoRetorno : null,
    traslado: asRecord(operativo.traslado),
    hasAttempt: card.contacts.length > 0 || Boolean(operativo.updatedAt) || Boolean(operativo.comentarioContacto),
    // Every tab maps its cards through here, so the include blocks all surface
    // group membership under the same field name.
    groupIds: card.groupMemberships?.map((membership) => membership.groupId) ?? [],
    readOnly: false,
  };
}
