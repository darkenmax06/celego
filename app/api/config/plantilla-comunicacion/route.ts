import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import {
  CONTACT_TEMPLATE_VARIABLES,
  DEFAULT_SCRIPT_TEXT,
  DEFAULT_WHATSAPP_TEXT,
} from "@/lib/contact-template";

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
      scriptText: config?.scriptText ?? DEFAULT_SCRIPT_TEXT,
      whatsappText: config?.whatsappText ?? DEFAULT_WHATSAPP_TEXT,
      updatedAt: config?.updatedAt ?? null,
      updatedBy: config?.updatedBy?.name ?? null,
    },
    variables: CONTACT_TEMPLATE_VARIABLES,
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
