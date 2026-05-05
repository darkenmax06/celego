import { NextResponse } from "next/server";
import { type UserRole } from "@prisma/client";
import { getAuthSession } from "@/lib/auth";

export async function requireApiSession(roles?: UserRole[]) {
  const session = await getAuthSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) } as const;
  }

  if (roles && !roles.includes(session.user.role)) {
    return { error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }) } as const;
  }

  return { session } as const;
}
