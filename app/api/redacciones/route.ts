import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const status = request.nextUrl.searchParams.get("status");
  const zona = request.nextUrl.searchParams.get("zona");
  const tipo = request.nextUrl.searchParams.get("tipo");
  const date = request.nextUrl.searchParams.get("date");
  const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(request.nextUrl.searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, Math.trunc(pageSizeRaw))) : 20;

  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;
  if (zona && zona !== "ALL") where.zona = zona;
  if (tipo && tipo !== "ALL") where.tipo = tipo;
  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.fecha = { gte: start, lt: end };
  }

  const [redacciones, total] = await Promise.all([
    prisma.redaction.findMany({
      where,
      include: {
        approvedBy: true,
        items: { include: { card: { include: { customer: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.redaction.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return NextResponse.json({
    redacciones,
    pagination: { page, pageSize, total, totalPages },
  });
}
