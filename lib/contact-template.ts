/**
 * Calls overhaul: single source of truth for the operator script / WhatsApp
 * templates (defaults, variable catalog and rendering). Pure module, safe to
 * import from client components and API routes alike.
 *
 * `{{empresa}}` is intentionally not offered: there is no company-name
 * configuration in the project yet.
 */

export const DEFAULT_SCRIPT_TEXT =
  "Hola {{name}}, le saludamos del equipo de entrega de tarjetas. Nos comunicamos para coordinar la entrega de su tarjeta con terminación {{tc}} (Cédula: {{cedula}}) en la dirección registrada: {{direccion}}, {{provincia}}. Por favor confírmenos si se encuentra en dicha dirección o si prefiere coordinar un día u horario de preferencia. ¡Muchas gracias!";

export const DEFAULT_WHATSAPP_TEXT =
  "¡Hola {{name}}! 👋 Le escribimos del departamento de entrega y logística. Le contactamos para coordinar la entrega de su tarjeta terminación *{{tc}}*.\n\n📍 *Dirección registrada:* {{direccion}}, {{provincia}}\n👤 *Titular:* {{name}} (Cédula: {{cedula}})\n\n¿Se encuentra disponible para recibirla o desea indicar una fecha/horario de su preferencia?";

export const CONTACT_TEMPLATE_VARIABLES = [
  { key: "{{name}}", label: "Nombre del cliente" },
  { key: "{{nombre_corto}}", label: "Primer nombre del cliente" },
  { key: "{{cedula}}", label: "Cédula del cliente" },
  { key: "{{tc}}", label: "Terminación / Referencia TC" },
  { key: "{{tipo_tarjeta}}", label: "Tipo de tarjeta (Crédito / Débito)" },
  { key: "{{provincia}}", label: "Provincia" },
  { key: "{{zona}}", label: "Zona operativa" },
  { key: "{{direccion}}", label: "Dirección de entrega" },
  { key: "{{nueva_direccion}}", label: "Nueva dirección recopilada en la llamada" },
  { key: "{{mensajero}}", label: "Mensajero asignado" },
  { key: "{{mensajero_telefono}}", label: "Teléfono del mensajero" },
  { key: "{{solicitud}}", label: "No. de Solicitud / Emisión" },
  { key: "{{telefono_principal}}", label: "Teléfono principal" },
  { key: "{{telefonos}}", label: "Todos los teléfonos del cliente" },
  { key: "{{operador}}", label: "Nombre del operador" },
  { key: "{{canal}}", label: "Canal de contacto (WhatsApp / Llamada directa)" },
  { key: "{{fecha_entrega}}", label: "Fecha de entrega preferida" },
  { key: "{{fecha_sla}}", label: "Fecha de vencimiento SLA" },
  { key: "{{fecha_hoy}}", label: "Fecha de hoy" },
  { key: "{{grupo}}", label: "Grupo(s) de la tarjeta" },
] as const;

export type ContactTemplateKey =
  (typeof CONTACT_TEMPLATE_VARIABLES)[number]["key"] extends `{{${infer K}}}` ? K : never;

export type ContactTemplateContext = Partial<Record<ContactTemplateKey, string | null | undefined>>;

/** Fallback shown when a variable has no value, so scripts never render raw `{{x}}`. */
const FALLBACKS: Partial<Record<ContactTemplateKey, string>> = {
  direccion: "No especificada",
  nueva_direccion: "No especificada",
  mensajero: "Sin asignar",
  mensajero_telefono: "-",
  solicitud: "N/A",
  telefono_principal: "-",
  telefonos: "-",
  canal: "-",
  fecha_entrega: "Sin fecha específica",
  fecha_sla: "-",
  grupo: "-",
};

/**
 * Replaces every known `{{variable}}` occurrence. Unknown placeholders are
 * left untouched so custom text survives; known ones without a value use a
 * Spanish fallback (or empty string).
 */
export function renderContactTemplate(text: string, ctx: ContactTemplateContext): string {
  let output = text;
  for (const variable of CONTACT_TEMPLATE_VARIABLES) {
    const name = variable.key.slice(2, -2) as ContactTemplateKey;
    const raw = ctx[name];
    const value = raw != null && String(raw).trim() !== "" ? String(raw) : (FALLBACKS[name] ?? "");
    output = output.replaceAll(variable.key, value);
  }
  return output;
}

export function formatCanalContacto(canal: string | null | undefined): string {
  if (canal === "WHATSAPP") return "WhatsApp";
  if (canal === "LLAMADA_DIRECTA") return "Llamada directa";
  return "";
}

export function formatTipoTarjeta(productType: string | null | undefined): string {
  if (productType === "DEBITO") return "Débito";
  if (productType === "CREDITO") return "Crédito";
  return "";
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

/** dd/MM/yyyy for a Date or a `YYYY-MM-DD...` string, without timezone drift on date-only values. */
export function formatTemplateDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

export type ContactTemplateSource = {
  nombre: string;
  cedula: string;
  tc: string;
  provincia: string;
  zona: string;
  direccion?: string | null;
  nuevaDireccion?: string | null;
  mensajero?: string | null;
  mensajeroTelefono?: string | null;
  solicitud?: string | null;
  telefonos?: string[];
  telefonoPrincipal?: string | null;
  operador?: string | null;
  canalContacto?: string | null;
  fechaPreferenciaEntrega?: Date | string | null;
  slaDueDate?: Date | string | null;
  productType?: string | null;
  grupos?: string[];
  today?: Date;
};

/** Builds the full template context from card / call data. */
export function buildContactTemplateContext(source: ContactTemplateSource): ContactTemplateContext {
  const telefonos = (source.telefonos ?? []).filter(Boolean);
  return {
    name: source.nombre,
    nombre_corto: firstName(source.nombre),
    cedula: source.cedula,
    tc: source.tc,
    tipo_tarjeta: formatTipoTarjeta(source.productType),
    provincia: source.provincia,
    zona: source.zona,
    direccion: source.nuevaDireccion?.trim() || source.direccion,
    nueva_direccion: source.nuevaDireccion,
    mensajero: source.mensajero,
    mensajero_telefono: source.mensajeroTelefono,
    solicitud: source.solicitud,
    telefono_principal: source.telefonoPrincipal ?? telefonos[0],
    telefonos: telefonos.join(", "),
    operador: source.operador,
    canal: formatCanalContacto(source.canalContacto),
    fecha_entrega: formatTemplateDate(source.fechaPreferenciaEntrega),
    fecha_sla: formatTemplateDate(source.slaDueDate),
    fecha_hoy: formatTemplateDate(source.today ?? new Date()),
    grupo: (source.grupos ?? []).join(", "),
  };
}
