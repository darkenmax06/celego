import { CardStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { generateBizcochito } from "@/lib/bizcochito";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(request.nextUrl.searchParams.get("pageSize") ?? "15");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(50, Math.max(1, Math.trunc(pageSizeRaw)))
    : 15;

  const [pendingCount, batches, total, latest] = await Promise.all([
    prisma.card.count({
      where: {
        status: CardStatus.ENTREGA_DIGITAL,
        bizcochito: false,
        digitalDeliveryCycle: { gt: 0 },
      },
    }),
    prisma.bizcochitoBatch.findMany({
      select: {
        id: true,
        code: true,
        generatedAt: true,
        itemCount: true,
        originalFileName: true,
        originalSha256: true,
        generatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ generatedAt: "desc" }, { sequence: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.bizcochitoBatch.count(),
    prisma.bizcochitoBatch.findFirst({
      select: { id: true, code: true, generatedAt: true, itemCount: true },
      orderBy: [{ generatedAt: "desc" }, { sequence: "desc" }],
    }),
  ]);

  return NextResponse.json({
    pendingCount,
    latest,
    batches,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const result = await generateBizcochito(auth.session.user.id, request);
  if (!result) {
    return NextResponse.json(
      { error: "No hay entregas digitales pendientes para generar" },
      { status: 409 },
    );
  }

  return new NextResponse(new Uint8Array(result.file), {
    status: 201,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${result.batch.originalFileName}"`,
      "X-Bizcochito-Code": result.batch.code,
      "X-Bizcochito-Id": result.batch.id,
    },
  });
}
