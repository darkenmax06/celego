import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createMobileToken } from "@/lib/mobile-auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  messengerId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Credenciales invalidas" }, { status: 401 });
  }

  const isValid = await compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
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
