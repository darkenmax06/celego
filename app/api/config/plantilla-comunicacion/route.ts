import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const DEFAULT_SCRIPT =
  "Hola {{name}}, le saludamos del equipo de entrega de tarjetas. Nos comunicamos para coordinar la entrega de su tarjeta con terminación {{tc}} (Cédula: {{cedula}}) en la dirección registrada: {{direccion}}, {{provincia}}. Por favor confírmenos si se encuentra en dicha dirección o si prefiere coordinar un día u horario de preferencia. ¡Muchas gracias!";

const DEFAULT_WHATSAPP =
  "¡Hola {{name}}! 👋 Le escribimos del departamento de entrega y logística. Le contactamos para coordinar la entrega de su tarjeta terminación *{{tc}}*.\n\n📍 *Dirección registrada:* {{direccion}}, {{provincia}}\n👤 *Titular:* {{name}} (Cédula: {{cedula}})\n\n¿Se encuentra disponible para recibirla o desea indicar una fecha/horario de su preferencia?";

const patchSchema = z.object({
  scriptText: z.string().min(5).max(5000),
  whatsappText: z.string().max(5000).optional(),
});

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const config = await prisma.operativeScriptConfig.findUnique({
    where: { id: "default" },
    include: { updatedBy: { select: { name: true, email: true } } },
  });

  return NextResponse.json({
    config: {
      scriptText: config?.scriptText ?? DEFAULT_SCRIPT,
      whatsappText: config?.whatsappText ?? DEFAULT_WHATSAPP,
      updatedAt: config?.updatedAt ?? null,
      updatedBy: config?.updatedBy?.name ?? null,
    },
    variables: [
      { key: "{{name}}", label: "Nombre del cliente" },
      { key: "{{cedula}}", label: "Cédula del cliente" },
      { key: "{{tc}}", label: "Terminación / Referencia TC" },
      { key: "{{provincia}}", label: "Provincia" },
      { key: "{{zona}}", label: "Zona operativa" },
      { key: "{{direccion}}", label: "Dirección de entrega" },
      { key: "{{mensajero}}", label: "Mensajero asignado" },
      { key: "{{solicitud}}", label: "No. de Solicitud / Emisión" },
      { key: "{{telefono_principal}}", label: "Teléfono principal" },
    ],
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de plantilla inválidos" }, { status: 400 });
  }

  const config = await prisma.operativeScriptConfig.upsert({
    where: { id: "default" },
    update: {
      scriptText: parsed.data.scriptText,
      whatsappText: parsed.data.whatsappText || null,
      updatedById: auth.session.user.id,
    },
    create: {
      id: "default",
      scriptText: parsed.data.scriptText,
      whatsappText: parsed.data.whatsappText || null,
      updatedById: auth.session.user.id,
    },
  });

  return NextResponse.json({
    config: {
      scriptText: config.scriptText,
      whatsappText: config.whatsappText,
      updatedAt: config.updatedAt,
    },
  });
}
