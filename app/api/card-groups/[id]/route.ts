import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

/**
 * SDD card-groups — Work Unit D (relocated + hardened from
 * `app/api/urgentes/groups/[id]/route.ts`).
 *
 * PATCH: rename group and/or add/remove members. DELETE: remove the group
 * (cascades `CardGroupMember`). No owner scoping — every ADMIN/OPERADOR may
 * edit or delete any shared group.
 *
 * Hardening over the original route:
 *  - Member addition uses ONE `createMany({ skipDuplicates: true })` call
 *    instead of an N-call upsert loop, and reports `{added, alreadyMember}`.
 *  - `addCardIds`/`removeCardIds` are capped at 500.
 *  - A duplicate name on rename now returns 409 instead of an unhandled 500.
 *  - Deleting a missing group now returns 404 instead of an unhandled throw.
 */
const patchSchema = z.object({
  name: z.string().min(1).optional(),
  addCardIds: z.array(z.string().min(1)).max(500).optional(),
  removeCardIds: z.array(z.string().min(1)).max(500).optional(),
});

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2025");
}

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
    try {
      await prisma.cardGroup.update({ where: { id }, data: { name: parsed.data.name } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json({ error: "Ya existe un grupo con ese nombre" }, { status: 409 });
      }
      throw error;
    }
  }

  let added = 0;
  let alreadyMember = 0;
  const addCardIds = parsed.data.addCardIds;
  if (addCardIds?.length) {
    const result = await prisma.cardGroupMember.createMany({
      data: addCardIds.map((cardId) => ({ groupId: id, cardId, addedById: auth.session.user.id })),
      skipDuplicates: true,
    });
    added = result.count;
    alreadyMember = addCardIds.length - added;
  }

  let removed = 0;
  const removeCardIds = parsed.data.removeCardIds;
  if (removeCardIds?.length) {
    const result = await prisma.cardGroupMember.deleteMany({
      where: { groupId: id, cardId: { in: removeCardIds } },
    });
    removed = result.count;
  }

  const updated = await prisma.cardGroup.findUnique({ where: { id } });

  return NextResponse.json({ group: updated, added, alreadyMember, removed });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    await prisma.cardGroup.delete({ where: { id } });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
