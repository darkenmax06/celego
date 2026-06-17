import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const keySchema = z.object({
  module: z.string().trim().min(2).max(80),
  contextKey: z.string().trim().min(1).max(120).default("default"),
});

const saveSchema = keySchema.extend({
  payload: z.record(z.string(), z.unknown()),
  version: z.number().int().min(0).optional(),
});

function draftResponse(draft: {
  module: string;
  contextKey: string;
  payload: Prisma.JsonValue;
  version: number;
  updatedAt: Date;
}) {
  return {
    module: draft.module,
    contextKey: draft.contextKey,
    payload: draft.payload,
    version: draft.version,
    updatedAt: draft.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = keySchema.safeParse({
    module: request.nextUrl.searchParams.get("module"),
    contextKey: request.nextUrl.searchParams.get("contextKey") ?? "default",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Modulo o contexto invalido" }, { status: 400 });
  }

  const draft = await prisma.workflowDraft.findUnique({
    where: {
      userId_module_contextKey: {
        userId: auth.session.user.id,
        module: parsed.data.module,
        contextKey: parsed.data.contextKey,
      },
    },
  });

  return NextResponse.json({ draft: draft ? draftResponse(draft) : null });
}

export async function PUT(request: Request) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = saveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Borrador invalido" }, { status: 400 });
  }

  const key = {
    userId: auth.session.user.id,
    module: parsed.data.module,
    contextKey: parsed.data.contextKey,
  };
  const existing = await prisma.workflowDraft.findUnique({
    where: {
      userId_module_contextKey: key,
    },
  });

  if (!existing) {
    if (parsed.data.version && parsed.data.version > 0) {
      return NextResponse.json(
        { error: "El borrador fue eliminado en otra sesion", draft: null },
        { status: 409 },
      );
    }

    const created = await prisma.workflowDraft.create({
      data: {
        ...key,
        payload: parsed.data.payload as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ draft: draftResponse(created) }, { status: 201 });
  }

  if (parsed.data.version !== existing.version) {
    return NextResponse.json(
      {
        error: "El borrador fue modificado en otra pestaña o equipo",
        draft: draftResponse(existing),
      },
      { status: 409 },
    );
  }

  const nextVersion = existing.version + 1;
  const result = await prisma.workflowDraft.updateMany({
    where: {
      id: existing.id,
      version: existing.version,
    },
    data: {
      payload: parsed.data.payload as Prisma.InputJsonValue,
      version: nextVersion,
    },
  });

  if (!result.count) {
    const current = await prisma.workflowDraft.findUnique({ where: { id: existing.id } });
    return NextResponse.json(
      {
        error: "El borrador fue modificado mientras se guardaba",
        draft: current ? draftResponse(current) : null,
      },
      { status: 409 },
    );
  }

  const updated = await prisma.workflowDraft.findUniqueOrThrow({
    where: { id: existing.id },
  });
  return NextResponse.json({ draft: draftResponse(updated) });
}

export async function DELETE(request: Request) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = keySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Modulo o contexto invalido" }, { status: 400 });
  }

  await prisma.workflowDraft.deleteMany({
    where: {
      userId: auth.session.user.id,
      module: parsed.data.module,
      contextKey: parsed.data.contextKey,
    },
  });

  return NextResponse.json({ ok: true });
}
