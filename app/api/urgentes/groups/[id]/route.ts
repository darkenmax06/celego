import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 3, task 3.4 (design D6).
 *
 * PATCH: rename group and/or add/remove members. DELETE: remove the group
 * (cascades `CardGroupMember`). No owner scoping — every OPERADOR may edit
 * or delete any shared group.
 */
const patchSchema = z.object({
  name: z.string().min(1).optional(),
  addCardIds: z.array(z.string().min(1)).optional(),
  removeCardIds: z.array(z.string().min(1)).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const group = await prisma.cardGroup.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
  }

  if (parsed.data.name) {
    await prisma.cardGroup.update({ where: { id }, data: { name: parsed.data.name } });
  }

  if (parsed.data.addCardIds?.length) {
    for (const cardId of parsed.data.addCardIds) {
      await prisma.cardGroupMember.upsert({
        where: { groupId_cardId: { groupId: id, cardId } },
        create: { groupId: id, cardId, addedById: auth.session.user.id },
        update: {},
      });
    }
  }

  if (parsed.data.removeCardIds?.length) {
    await prisma.cardGroupMember.deleteMany({
      where: { groupId: id, cardId: { in: parsed.data.removeCardIds } },
    });
  }

  const updated = await prisma.cardGroup.findUnique({
    where: { id },
    include: { members: true },
  });

  return NextResponse.json({ group: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await prisma.cardGroup.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
