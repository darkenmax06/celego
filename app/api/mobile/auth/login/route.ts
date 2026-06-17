import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createMobileToken } from "@/lib/mobile-auth";
import { tryWriteAuditEvent } from "@/lib/audit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  messengerId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    await tryWriteAuditEvent({
      entity: "AUTH_MOBILE",
      entityId: "credentials",
      action: "LOGIN",
      result: "FAILURE",
      details: { reason: "INVALID_PAYLOAD" },
      request,
    });
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user || !user.active) {
    await tryWriteAuditEvent({
      entity: "AUTH_MOBILE",
      entityId: user?.id ?? "unknown",
      action: "LOGIN",
      result: "FAILURE",
      actorEmail: email,
      targetUserId: user?.id,
      details: { reason: user ? "INACTIVE_USER" : "USER_NOT_FOUND" },
      request,
    });
    return NextResponse.json({ error: "Credenciales invalidas" }, { status: 401 });
  }

  const isValid = await compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    await tryWriteAuditEvent({
      entity: "AUTH_MOBILE",
      entityId: user.id,
      action: "LOGIN",
      result: "FAILURE",
      actorEmail: email,
      targetUserId: user.id,
      details: { reason: "INVALID_PASSWORD" },
      request,
    });
    return NextResponse.json({ error: "Credenciales invalidas" }, { status: 401 });
  }

  if (
    user.role !== UserRole.MENSAJERO &&
    user.role !== UserRole.OPERADOR &&
    user.role !== UserRole.ADMIN
  ) {
    return NextResponse.json({ error: "Rol no habilitado para app mobile" }, { status: 403 });
  }

  const messengerId: string | null = parsed.data.messengerId ?? null;
  if (user.role === UserRole.MENSAJERO) {
    if (!messengerId) {
      return NextResponse.json(
        { error: "Para rol MENSAJERO debes enviar messengerId" },
        { status: 400 },
      );
    }

    const messenger = await prisma.messenger.findUnique({
      where: { id: messengerId },
      select: { id: true, activo: true },
    });
    if (!messenger || !messenger.activo) {
      return NextResponse.json({ error: "Mensajero no valido o inactivo" }, { status: 400 });
    }
  }

  const token = createMobileToken({
    uid: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    messengerId,
  });

  await tryWriteAuditEvent({
    entity: "AUTH_MOBILE",
    entityId: user.id,
    action: "LOGIN",
    userId: user.id,
    actorEmail: email,
    targetUserId: user.id,
    details: { messengerId },
    request,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      messengerId,
    },
    expiresInSeconds: 60 * 60 * 24 * 15,
  });
}
