import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { writeAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const batch = await prisma.bizcochitoBatch.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      originalFileName: true,
      originalFile: true,
    },
  });
  if (!batch?.originalFile?.length) {
    return NextResponse.json({ error: "Archivo historico no encontrado" }, { status: 404 });
  }

  await writeAuditEvent({
    entity: "BIZCOCHITO",
    entityId: batch.id,
    action: "DOWNLOAD_ORIGINAL",
    userId: auth.session.user.id,
    details: { code: batch.code },
    request,
  });

  return new NextResponse(new Uint8Array(batch.originalFile), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${batch.originalFileName}"`,
    },
  });
}
