import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  nombre: z.string().min(2),
});

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const motivos = await prisma.returnReason.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json({ motivos });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const motivo = await prisma.returnReason.upsert({
    where: { nombre: parsed.data.nombre },
    update: { active: true },
    create: { nombre: parsed.data.nombre },
  });

  return NextResponse.json({ motivo }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const { id } = (await request.json()) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const motivo = await prisma.returnReason.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ motivo });
}
