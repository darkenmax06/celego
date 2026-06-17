import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const action = request.nextUrl.searchParams.get("action")?.trim();
  const result = request.nextUrl.searchParams.get("result")?.trim();
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(request.nextUrl.searchParams.get("pageSize") ?? "25");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(100, Math.max(1, Math.trunc(pageSizeRaw)))
    : 25;

  const where: Prisma.AuditLogWhereInput = {
    OR: [{ userId: id }, { targetUserId: id }],
    ...(action ? { action } : {}),
    ...(result ? { result } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  const [events, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        targetUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    events,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
