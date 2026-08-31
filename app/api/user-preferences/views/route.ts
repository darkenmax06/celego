import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const ALLOWED_VIEW_TYPES = ["list", "cards", "kanban", "pivot", "calendar", "timeline", "grid", "gantt", "cohort"] as const;

const putSchema = z.object({
  sectionKey: z.string().min(1).max(100),
  viewType: z.enum(ALLOWED_VIEW_TYPES),
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
  const pref = await prisma.userViewPreference.findUnique({
    where: {
      userId_sectionKey: {
        userId,
        sectionKey,
      },
    },
  });

  return NextResponse.json({
    sectionKey,
    viewType: pref?.viewType ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const userId = auth.session.user.id;
  const { sectionKey, viewType } = parsed.data;

  const pref = await prisma.userViewPreference.upsert({
    where: {
      userId_sectionKey: {
        userId,
        sectionKey,
      },
    },
    create: {
      userId,
      sectionKey,
      viewType,
    },
    update: {
      viewType,
    },
  });

  return NextResponse.json({
    ok: true,
    sectionKey: pref.sectionKey,
    viewType: pref.viewType,
    updatedAt: pref.updatedAt.toISOString(),
  });
}
