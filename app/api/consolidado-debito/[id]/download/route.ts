import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { issuesCsv } from "@/lib/debit-consolidation/service";
import { prisma } from "@/lib/prisma";
import { tryWriteAuditEvent } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const kind = new URL(request.url).searchParams.get("kind") ?? "output";
  const run = await prisma.debitConsolidationRun.findUnique({
    where: { id },
    include: { issues: { orderBy: [{ severity: "asc" }, { rowNumber: "asc" }] } },
  });
  if (!run) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  await tryWriteAuditEvent({
    entity: "DEBIT_CONSOLIDATION",
    entityId: id,
    action: `DOWNLOAD_${kind.toUpperCase()}`,
    userId: auth.session.user.id,
    actorEmail: auth.session.user.email,
    request,
  });
  if (kind === "issues") {
    return new Response(
      issuesCsv(
        run.issues.map((issue) => ({
          ...issue,
          sheet: issue.sheet ?? undefined,
          rowNumber: issue.rowNumber ?? undefined,
          requestNumber: issue.requestNumber ?? undefined,
        })),
      ),
      {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="incidencias-${id}.csv"`,
      },
      },
    );
  }
  if (!run.outputFile) {
    return NextResponse.json({ error: "El resultado aún no está disponible" }, { status: 409 });
  }
  return new Response(new Uint8Array(run.outputFile), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${run.outputFileName ?? "consolidado-debito.xlsx"}"`,
    },
  });
}
