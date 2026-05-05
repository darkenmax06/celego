import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { parseLotesImport } from "@/lib/importers/lotes";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const parsed = parseLotesImport(Buffer.from(await file.arrayBuffer()));

  let upserts = 0;
  for (const row of parsed.rows) {
    await prisma.lot.upsert({
      where: { lotNumber: row.lotNumber },
      update: {
        enviadoA: row.enviadoA,
        fechaEnvio: row.fechaEnvio ?? new Date(),
        fechaRetorno: row.fechaRetorno,
        estatus: row.estatus,
      },
      create: {
        lotNumber: row.lotNumber,
        enviadoA: row.enviadoA,
        fechaEnvio: row.fechaEnvio ?? new Date(),
        fechaRetorno: row.fechaRetorno,
        estatus: row.estatus,
      },
    });
    upserts += 1;
  }

  await prisma.auditLog.create({
    data: {
      entity: "LOT_IMPORT",
      entityId: "bulk",
      action: "IMPORT",
      userId: auth.session.user.id,
      details: { rows: parsed.rows.length },
    },
  });

  return NextResponse.json({
    imported: parsed.rows.length,
    upserts,
    errors: parsed.errors,
  });
}
