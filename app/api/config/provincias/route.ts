import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  nombre: z.string().min(2),
  zona: z.string().min(2),
});

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const provincias = await prisma.provinceConfig.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json({ provincias });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const provincia = await prisma.provinceConfig.upsert({
    where: { nombre: parsed.data.nombre },
    update: { zona: parsed.data.zona, active: true },
    create: { nombre: parsed.data.nombre, zona: parsed.data.zona, active: true },
  });

  return NextResponse.json({ provincia }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const { id, zona, active } = (await request.json()) as {
    id?: string;
    zona?: string;
    active?: boolean;
  };

  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const provincia = await prisma.provinceConfig.update({
    where: { id },
    data: {
      zona: zona ?? undefined,
      active: typeof active === "boolean" ? active : undefined,
    },
  });

  return NextResponse.json({ provincia });
}
