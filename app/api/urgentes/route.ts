import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 3, task 3.3.
 *
 * GET: unified urgent card list (spec "Unified Urgent Card List & Grouping").
 * Lists every active urgent card (SOLICITUD, RECLAMACION, GENERAL/legacy),
 * filterable by `groupId` and free-text search, paginated.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25));

  const where = {
    urgent: true,
    ...(groupId ? { groupMemberships: { some: { groupId } } } : {}),
    ...(search
      ? {
          OR: [
            { tc: { contains: search, mode: "insensitive" as const } },
            { customer: { nombre: { contains: search, mode: "insensitive" as const } } },
            { customer: { cedula: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      select: {
        id: true,
        tc: true,
        status: true,
        provincia: true,
        zona: true,
        hadSolicitud: true,
        hadReclamacion: true,
        customer: { select: { nombre: true, cedula: true } },
        urgentCases: {
          where: { resolvedAt: null },
          orderBy: { importedAt: "desc" },
          take: 1,
        },
        groupMemberships: { select: { groupId: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.card.count({ where }),
  ]);

  return NextResponse.json({ cards, total, page, pageSize });
}
