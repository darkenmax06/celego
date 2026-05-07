import { NextRequest, NextResponse } from "next/server";
import { type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyMobileToken } from "@/lib/mobile-auth";

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

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!user || !user.active) {
    return { error: NextResponse.json({ error: "Usuario no activo" }, { status: 401 }) } as const;
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
