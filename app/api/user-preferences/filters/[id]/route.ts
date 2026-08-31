import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, context: Context) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const userId = auth.session.user.id;

  const existing = await prisma.userSavedFilter.findUnique({
    where: { id },
  });

  if (!existing || existing.userId !== userId) {
    return NextResponse.json(
      { error: "Filtro guardado no encontrado" },
      { status: 404 },
    );
  }

  await prisma.userSavedFilter.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const userId = auth.session.user.id;

  const existing = await prisma.userSavedFilter.findUnique({
    where: { id },
  });

  if (!existing || existing.userId !== userId) {
    return NextResponse.json(
      { error: "Filtro guardado no encontrado" },
      { status: 404 },
    );
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", details: parsed.error.format() },
      { status: 400 },
    );
  }

  if (parsed.data.isDefault) {
    await prisma.userSavedFilter.updateMany({
      where: { userId, sectionKey: existing.sectionKey, isDefault: true },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.userSavedFilter.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.filters ? { filters: parsed.data.filters as object } : {}),
      ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
    },
  });

  return NextResponse.json({ filter: updated });
}
