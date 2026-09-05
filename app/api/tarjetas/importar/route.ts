import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { CardImportConflictError, persistNormalizedCardImport } from "@/lib/card-service";
import { parseNormalizedCardRows } from "@/lib/importers/card-normalize";
import { getSheetRows, readWorkbook } from "@/lib/importers/workbook";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.cardImportBatch.findUnique({ where: { sha256 } });
  if (existing?.status === "COMPLETED") {
    return NextResponse.json({ replay: true, batch: existing, created: existing.createdCount, updated: existing.updatedCount, skipped: existing.skippedCount, rejected: existing.rejectedCount });
  }

  let parsed;
  try {
    parsed = parseNormalizedCardRows(getSheetRows(readWorkbook(buffer)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Formato de importacion invalido" }, { status: 422 });
  }

  const batch = existing ?? await prisma.cardImportBatch.create({
    data: { origin: parsed.origin, originalName: file.name, sha256, importedById: auth.session.user.id, label: form.get("label")?.toString().trim() || null },
  });

  try {
    const result = await persistNormalizedCardImport({ batchId: batch.id, rows: parsed.rows, rejectedRows: parsed.errors, byUserId: auth.session.user.id });
    return NextResponse.json({ ...result, replay: false, origin: parsed.origin, batch: { id: batch.id, sha256 }, errors: parsed.errors, parsedRows: parsed.rows.length });
  } catch (error) {
    await prisma.cardImportBatch.update({ where: { id: batch.id }, data: { status: "REJECTED", rejectedCount: parsed.errors.length, completedAt: new Date() } }).catch(() => undefined);
    if (error instanceof CardImportConflictError) return NextResponse.json({ error: error.code, batchId: batch.id }, { status: 409 });
    if (error instanceof Error && error.message.startsWith("UNRESOLVED_ZONE")) {
      const [, row = "", value = ""] = /^UNRESOLVED_ZONE_ROW_(\d+):?(.*)$/.exec(error.message) ?? [];
      const detail = value ? `fila ${row}: "${value}"` : `fila ${row}`;
      return NextResponse.json({ error: `Zona/provincia no resoluble (${detail})`, batchId: batch.id }, { status: 422 });
    }
    throw error;
  }
}
