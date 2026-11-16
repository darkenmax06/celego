import { NextResponse } from "next/server";
import { type UserRole } from "@prisma/client";
import { getAuthSession } from "@/lib/auth";
import { tryWriteAuditEvent } from "@/lib/audit";
import { resolveSessionUser } from "@/lib/session-user";

export async function requireApiSession(roles?: UserRole[]) {
  const session = await getAuthSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) } as const;
  }

  const sessionUserEmail =
    typeof session.user.email === "string" ? session.user.email.trim().toLowerCase() : "";

  // Recovers sessions after a DB reset/migration where the id changed but the email did not.
  const user = await resolveSessionUser(session);

  if (!user) {
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
