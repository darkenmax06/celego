import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { persistDebitConsolidadoImport } from "@/lib/card-service";
import { parseDebitConsolidadoImport } from "@/lib/importers/debit-consolidado";
import { prisma } from "@/lib/prisma";
import { DispatchOrigin } from "@prisma/client";

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const existing = await prisma.cardImportBatch.findUnique({ where: { sha256 } });
  if (existing?.status === "COMPLETED") {
    return NextResponse.json({
      replay: true,
      batch: existing,
      created: existing.createdCount,
      updated: existing.updatedCount,
      skipped: existing.skippedCount,
      rejected: existing.rejectedCount,
    });
  }

  let parsed;
  try {
    parsed = parseDebitConsolidadoImport(buffer);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Formato de consolidado inválido" },
      { status: 422 },
    );
  }

  const batch =
    existing ??
    (await prisma.cardImportBatch.create({
      data: {
        origin: DispatchOrigin.BPD_DEBITO,
        originalName: file.name,
        sha256,
        importedById: auth.session.user.id,
        label: form.get("label")?.toString().trim() || "Consolidado Débito",
      },
    }));

  try {
    const result = await persistDebitConsolidadoImport({
      batchId: batch.id,
      rows: parsed.rows,
      byUserId: auth.session.user.id,
    });

    return NextResponse.json({
      ...result,
      replay: false,
      batch: { id: batch.id, sha256 },
      errors: parsed.errors,
      totalRows: parsed.rows.length,
    });
  } catch (error) {
    console.error("Error persistDebitConsolidadoImport:", error);
    await prisma.cardImportBatch
      .update({
        where: { id: batch.id },
        data: { status: "REJECTED", rejectedCount: parsed.errors.length, completedAt: new Date() },
      })
      .catch(() => undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al procesar el consolidado de débito" },
      { status: 500 },
    );
  }
}
