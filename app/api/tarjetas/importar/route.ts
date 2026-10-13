import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { persistNormalizedCardImport } from "@/lib/card-service";
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
  // A completed batch only blocks re-import while its cards still exist; deleting a card nulls its import row link.
  const hasLiveCards = existing?.status === "COMPLETED"
    && await prisma.cardImportRow.count({ where: { batchId: existing.id, cardId: { not: null } } }) > 0;
  if (existing && hasLiveCards) {
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
    const { rejectedRows, skippedRows, ...counts } = result;
    return NextResponse.json({
      ...counts,
      replay: false,
      origin: parsed.origin,
      batch: { id: batch.id, sha256 },
      errors: rejectedRows,
      skippedRows,
      ignoredRows: parsed.ignored,
      parsedRows: parsed.rows.length,
    });
  } catch (error) {
    await prisma.cardImportBatch.update({ where: { id: batch.id }, data: { status: "REJECTED", rejectedCount: parsed.errors.length, completedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}
