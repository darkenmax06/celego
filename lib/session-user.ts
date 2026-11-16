import { type Session } from "next-auth";
import { type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SessionUser = { id: string; role: UserRole };

/**
 * The live DB user behind a JWT session, or null when it no longer exists or
 * is inactive (for example after a DB restore/reset). Falls back to the email
 * when the id changed but the same account still exists.
 */
export async function resolveSessionUser(session: Session | null): Promise<SessionUser | null> {
  if (!session?.user) return null;

  const sessionUserId = typeof session.user.id === "string" ? session.user.id : "";
  const sessionUserEmail =
    typeof session.user.email === "string" ? session.user.email.trim().toLowerCase() : "";

  let user = sessionUserId
    ? await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, role: true, active: true },
      })
    : null;

  if ((!user || !user.active) && sessionUserEmail) {
    user = await prisma.user.findUnique({
      where: { email: sessionUserEmail },
      select: { id: true, role: true, active: true },
    });
  }

  if (!user || !user.active) return null;
  return { id: user.id, role: user.role };
}

export { SESSION_EXPIRED_PATH } from "@/lib/session-expired";
