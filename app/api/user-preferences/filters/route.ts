import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  sectionKey: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  filters: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const sectionKey = request.nextUrl.searchParams.get("sectionKey")?.trim();
  if (!sectionKey) {
    return NextResponse.json(
      { error: "Parametro 'sectionKey' es requerido" },
      { status: 400 },
    );
  }

  const userId = auth.session.user.id;
  const savedFilters = await prisma.userSavedFilter.findMany({
    where: {
      userId,
      sectionKey,
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    sectionKey,
    filters: savedFilters,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const userId = auth.session.user.id;
  const { sectionKey, name, filters, isDefault } = parsed.data;

  // If set as default, reset existing defaults for this user & section
  if (isDefault) {
    await prisma.userSavedFilter.updateMany({
      where: { userId, sectionKey, isDefault: true },
      data: { isDefault: false },
    });
  }

  const savedFilter = await prisma.userSavedFilter.create({
    data: {
      userId,
      sectionKey,
      name,
      filters: filters as object,
      isDefault: isDefault ?? false,
    },
  });

  return NextResponse.json({ filter: savedFilter }, { status: 201 });
}
