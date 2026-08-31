import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { buildListEnvelope, compile } from "@/lib/list-query";
import { actividadListQuery } from "@/lib/list-query/descriptors/actividad";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  // The `OR` scope below is AUTHORIZATION, not a filter, and it stays first.
  // The actividad descriptor deliberately declares NO search fields, so the
  // compiled `where` can never carry its own `OR` and overwrite this scope.
  const query = compile(actividadListQuery, request.nextUrl.searchParams);
  const where: Prisma.AuditLogWhereInput = {
    OR: [{ userId: id }, { targetUserId: id }],
    ...query.where,
  };

  const [events, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        targetUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    events,
    pagination: buildListEnvelope({ page: query.page, pageSize: query.pageSize, total }),
  });
}
