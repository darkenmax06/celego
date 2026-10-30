import { NextRequest, NextResponse } from "next/server";
import { type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyMobileToken } from "@/lib/mobile-auth";
import { MESSENGER_ARCHIVED_MESSAGE } from "@/lib/messenger-lifecycle";

type MobileSessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  messengerId: string | null;
};

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token.trim();
}

export async function requireMobileSession(request: NextRequest, roles?: UserRole[]) {
  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "No autenticado (token requerido)" }, { status: 401 }) } as const;
  }

  const payload = verifyMobileToken(token);
  if (!payload) {
    return { error: NextResponse.json({ error: "Token invalido o expirado" }, { status: 401 }) } as const;
  }

  if (roles && !roles.includes(payload.role)) {
    return { error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }) } as const;
  }

  const [user, messenger] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payload.uid },
      select: { id: true, email: true, name: true, role: true, active: true },
    }),
    payload.messengerId
      ? prisma.messenger.findUnique({ where: { id: payload.messengerId }, select: { activo: true } })
      : Promise.resolve(null),
  ]);
  if (!user || !user.active) {
    return { error: NextResponse.json({ error: "Usuario no activo" }, { status: 401 }) } as const;
  }
  // Only field messengers lose access; ADMIN/OPERADOR tokens may carry any messengerId.
  if (user.role === "MENSAJERO" && payload.messengerId && !messenger?.activo) {
    return { error: NextResponse.json({ error: MESSENGER_ARCHIVED_MESSAGE }, { status: 401 }) } as const;
  }

  const sessionUser: MobileSessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    messengerId: payload.messengerId ?? null,
  };

  return { session: { user: sessionUser } } as const;
}
