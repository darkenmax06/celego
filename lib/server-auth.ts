import { type Session } from "next-auth";
import { type UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";

export async function requireSession() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
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
