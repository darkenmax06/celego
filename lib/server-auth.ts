import { type Session } from "next-auth";
import { type UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { resolveSessionUser, SESSION_EXPIRED_PATH } from "@/lib/session-user";

export async function requireSession(): Promise<Session> {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }
  // A valid JWT can outlive its user (DB restore, deleted or deactivated
  // account). Clear it and send the user to log in instead of rendering pages
  // whose API calls will all fail with 401.
  const user = await resolveSessionUser(session);
  if (!user) {
    redirect(SESSION_EXPIRED_PATH);
  }
  return { ...session, user: { ...session.user, id: user.id, role: user.role } };
}

export function hasRole(session: Session, roles: UserRole[]) {
  return roles.includes(session.user.role);
}

export async function requireRole(roles: UserRole[]) {
  const session = await requireSession();
  if (!hasRole(session, roles)) {
    redirect("/dashboard");
  }
  return session;
}
