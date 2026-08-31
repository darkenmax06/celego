import { hash } from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { writeAuditEvent } from "@/lib/audit";
import { buildListEnvelope, compile } from "@/lib/list-query";
import { configUsuariosListQuery } from "@/lib/list-query/descriptors/config-usuarios";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(120),
  role: z.nativeEnum(UserRole),
  active: z.boolean().default(true),
});

const updateSchema = z
  .object({
    id: z.string().cuid(),
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(200).optional(),
    password: z.string().min(6).max(120).optional(),
    role: z.nativeEnum(UserRole).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.password !== undefined ||
      value.role !== undefined ||
      value.active !== undefined,
    "Debe indicar al menos un cambio",
  );

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  // `q` searches name/email, `role` DROPS an unknown value silently and `active`
  // keeps the "true"/"false" encoding this route has always accepted.
  const query = compile(configUsuariosListQuery, request.nextUrl.searchParams);
  const where: Prisma.UserWhereInput = query.where;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    users,
    currentUserId: auth.session.user.id,
    pagination: buildListEnvelope({ page: query.page, pageSize: query.pageSize, total }),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          passwordHash: await hash(parsed.data.password, 10),
          role: parsed.data.role,
          active: parsed.data.active,
        },
        select: userSelect,
      });

      await writeAuditEvent(
        {
          entity: "USER",
          entityId: user.id,
          action: "CREATE",
          userId: auth.session.user.id,
          targetUserId: user.id,
          details: {
            name: user.name,
            email: user.email,
            role: user.role,
            active: user.active,
          },
          request,
        },
        tx,
      );
      return user;
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "El correo ya existe" }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findUnique({
          where: { id: parsed.data.id },
          select: userSelect,
        });
        if (!existing) throw new Error("USER_NOT_FOUND");

        const isSelf = existing.id === auth.session.user.id;
        if (isSelf && parsed.data.active === false) {
          throw new Error("SELF_DEACTIVATION");
        }
        if (isSelf && parsed.data.role && parsed.data.role !== UserRole.ADMIN) {
          throw new Error("SELF_DEMOTION");
        }

        const removesActiveAdmin =
          existing.active &&
          existing.role === UserRole.ADMIN &&
          (parsed.data.active === false ||
            (parsed.data.role !== undefined && parsed.data.role !== UserRole.ADMIN));
        if (removesActiveAdmin) {
          const activeAdmins = await tx.user.count({
            where: { role: UserRole.ADMIN, active: true },
          });
          if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
        }

        const data: Prisma.UserUpdateInput = {};
        if (parsed.data.name !== undefined) data.name = parsed.data.name;
        if (parsed.data.email !== undefined) data.email = parsed.data.email.toLowerCase();
        if (parsed.data.role !== undefined) data.role = parsed.data.role;
        if (parsed.data.active !== undefined) data.active = parsed.data.active;
        if (parsed.data.password !== undefined) {
          data.passwordHash = await hash(parsed.data.password, 10);
        }

        const user = await tx.user.update({
          where: { id: parsed.data.id },
          data,
          select: userSelect,
        });
        await writeAuditEvent(
          {
            entity: "USER",
            entityId: user.id,
            action: parsed.data.password !== undefined ? "UPDATE_PASSWORD" : "UPDATE",
            userId: auth.session.user.id,
            targetUserId: user.id,
            details: {
              before: {
                name: existing.name,
                email: existing.email,
                role: existing.role,
                active: existing.active,
              },
              after: {
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active,
              },
              passwordChanged: parsed.data.password !== undefined,
            },
            request,
          },
          tx,
        );
        return user;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "El correo ya existe" }, { status: 409 });
    }
    if (error instanceof Error) {
      const messages: Record<string, [string, number]> = {
        USER_NOT_FOUND: ["Usuario no encontrado", 404],
        SELF_DEACTIVATION: ["No puedes desactivar tu propio usuario", 400],
        SELF_DEMOTION: ["No puedes quitarte tu propio rol de administrador", 400],
        LAST_ADMIN: ["Debe permanecer al menos un administrador activo", 409],
      };
      const known = messages[error.message];
      if (known) return NextResponse.json({ error: known[0] }, { status: known[1] });
    }
    throw error;
  }
}
