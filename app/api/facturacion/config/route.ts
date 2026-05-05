import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  remoteSurchargeCents: z.number().int().min(0),
});

async function ensureBillingConfig() {
  return prisma.billingConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", remoteSurchargeCents: 0 },
  });
}

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "FACTURACION", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const config = await ensureBillingConfig();
  return NextResponse.json({ remoteSurchargeCents: config.remoteSurchargeCents });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const config = await prisma.billingConfig.upsert({
    where: { id: "default" },
    update: { remoteSurchargeCents: parsed.data.remoteSurchargeCents },
    create: {
      id: "default",
      remoteSurchargeCents: parsed.data.remoteSurchargeCents,
    },
  });

  return NextResponse.json({ remoteSurchargeCents: config.remoteSurchargeCents });
}
