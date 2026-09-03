import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 3, task 3.4 (design D6).
 *
 * `CardGroup` is shared across every operator — no owner scoping on
 * edit/delete (accepted proposal decision).
 */
export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const groups = await prisma.cardGroup.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { members: true } } },
  });

  return NextResponse.json({ groups });
}

const createSchema = z.object({
  name: z.string().min(1),
  cardIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const group = await prisma.cardGroup.create({
    data: {
      name: parsed.data.name,
      createdById: auth.session.user.id,
      members: {
        create: parsed.data.cardIds.map((cardId) => ({
          cardId,
          addedById: auth.session.user.id,
        })),
      },
    },
    include: { members: true },
  });

  return NextResponse.json({ group }, { status: 201 });
}
