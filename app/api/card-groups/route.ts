import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

/**
 * SDD card-groups — Work Unit D (relocated + hardened from
 * `app/api/urgentes/groups/route.ts`).
 *
 * `CardGroup` is shared across every operator — no owner scoping on
 * edit/delete (accepted proposal decision, unchanged from the original).
 *
 * Hardening over the original route:
 *  - GET widened to ADMIN/OPERADOR/FACTURACION/MENSAJERO, matching
 *    `GET /api/tarjetas` (the "Grupo" facet must be readable by every role
 *    that can view the tarjetas list).
 *  - `cardIds` defaults to `[]` (was `.min(1)`) and is capped at 500.
 *  - A duplicate group name now returns 409 instead of an unhandled 500.
 */
export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const groups = await prisma.cardGroup.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { members: true } } },
  });

  return NextResponse.json({ groups });
}

const createSchema = z.object({
  name: z.string().min(1),
  cardIds: z.array(z.string().min(1)).max(500).default([]),
});

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  let group;
  try {
    group = await prisma.cardGroup.create({
      data: { name: parsed.data.name, createdById: auth.session.user.id },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Ya existe un grupo con ese nombre" }, { status: 409 });
    }
    throw error;
  }

  let added = 0;
  if (parsed.data.cardIds.length > 0) {
    const result = await prisma.cardGroupMember.createMany({
      data: parsed.data.cardIds.map((cardId) => ({
        groupId: group.id,
        cardId,
        addedById: auth.session.user.id,
      })),
      skipDuplicates: true,
    });
    added = result.count;
  }

  return NextResponse.json({ group, added, alreadyMember: 0 }, { status: 201 });
}
