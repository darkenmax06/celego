import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { parseLotesImport } from "@/lib/importers/lotes";
import { prisma } from "@/lib/prisma";
import { mapLotStatus } from "@/lib/lot-status";

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
    // Typed dual-write (SDD `rutas-lotes-redesign`, Slice 3, task 3.3,
    // orchestrator-added): this bulk upsert is a 4th `Lot.estatus` writer,
    // bypassing `applyLotItemResult` entirely. `mapLotStatus` returns null
    // (report-and-skip) for any free-text "ESTATUS"/"STATUS" spreadsheet
    // value it doesn't recognize; the legacy `estatus` string still gets the
    // raw value either way.
    const estatusTipo = mapLotStatus(row.estatus);
    await prisma.lot.upsert({
      where: { lotNumber: row.lotNumber },
      update: {
        enviadoA: row.enviadoA,
        fechaEnvio: row.fechaEnvio ?? new Date(),
        fechaRetorno: row.fechaRetorno,
        estatus: row.estatus,
        estatusTipo,
      },
      create: {
        lotNumber: row.lotNumber,
        enviadoA: row.enviadoA,
        fechaEnvio: row.fechaEnvio ?? new Date(),
        fechaRetorno: row.fechaRetorno,
        estatus: row.estatus,
        estatusTipo,
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
