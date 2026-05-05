import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  businessDays: z.number().int().min(1).max(30),
});

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const config = await prisma.sLAConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", businessDays: 5 },
  });

  return NextResponse.json({ config });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const config = await prisma.sLAConfig.upsert({
    where: { id: "default" },
    update: {
      businessDays: parsed.data.businessDays,
      updatedById: auth.session.user.id,
    },
    create: {
      id: "default",
      businessDays: parsed.data.businessDays,
      updatedById: auth.session.user.id,
    },
  });

  return NextResponse.json({ config });
}
