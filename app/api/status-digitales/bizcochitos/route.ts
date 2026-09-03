import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { generateBizcochito } from "@/lib/bizcochito";
import { DIGITAL_DELIVERY_STATUSES } from "@/lib/card-transition";
import { buildListEnvelope, compile } from "@/lib/list-query";
import { bizcochitosListQuery } from "@/lib/list-query/descriptors/bizcochitos";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  // This route accepts no filters, no search and no sort; the descriptor only
  // carries its 15/50 page sizes and the `generatedAt desc, sequence desc`
  // ordering. The `count()` below stays unfiltered, exactly as before.
  const query = compile(bizcochitosListQuery, request.nextUrl.searchParams);

  const [pendingCount, batches, total, latest] = await Promise.all([
    prisma.card.count({
      where: {
        status: { in: Array.from(DIGITAL_DELIVERY_STATUSES) },
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
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
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
    pagination: buildListEnvelope({ page: query.page, pageSize: query.pageSize, total }),
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
