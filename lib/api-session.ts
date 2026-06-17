import { NextResponse } from "next/server";
import { type UserRole } from "@prisma/client";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tryWriteAuditEvent } from "@/lib/audit";

export async function requireApiSession(roles?: UserRole[]) {
  const session = await getAuthSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) } as const;
  }

  const sessionUserId = typeof session.user.id === "string" ? session.user.id : "";
  const sessionUserEmail =
    typeof session.user.email === "string" ? session.user.email.trim().toLowerCase() : "";

  let user = sessionUserId
    ? await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, role: true, active: true },
      })
    : null;

  // Permite recuperar sesion tras reset/migracion de DB donde el id cambia
  // pero el email sigue siendo el mismo.
  if ((!user || !user.active) && sessionUserEmail) {
    user = await prisma.user.findUnique({
      where: { email: sessionUserEmail },
      select: { id: true, role: true, active: true },
    });
  }

  if (!user || !user.active) {
    return {
      error: NextResponse.json(
        { error: "Sesion invalida o expirada. Inicia sesion nuevamente." },
        { status: 401 },
      ),
    } as const;
  }

  if (roles && !roles.includes(user.role)) {
    await tryWriteAuditEvent({
      entity: "AUTHORIZATION",
      entityId: user.id,
      action: "ACCESS",
      result: "DENIED",
      userId: user.id,
      actorEmail: sessionUserEmail,
      details: { requiredRoles: roles, currentRole: user.role },
    });
    return { error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }) } as const;
  }

  return {
    session: {
      ...session,
      user: {
        ...session.user,
        id: user.id,
        role: user.role,
      },
    },
  } as const;
}
