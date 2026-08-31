import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { persistDebitDespachoImport } from "@/lib/card-service";
import { parseDebitDespachoImport } from "@/lib/importers/debit-despacho";
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

  let parsed;
  try {
    parsed = parseDebitDespachoImport(buffer);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Formato de despacho de débito inválido" },
      { status: 422 },
    );
  }

  const existing = await prisma.cardImportBatch.findUnique({ where: { sha256 } });
  const batch =
    existing ??
    (await prisma.cardImportBatch.create({
      data: {
        origin: DispatchOrigin.BPD_DEBITO,
        originalName: file.name,
        sha256,
        importedById: auth.session.user.id,
        label: form.get("label")?.toString().trim() || "Despacho Débito",
      },
    }));

  try {
    const result = await persistDebitDespachoImport({
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
      hasPinit: true,
    });
  } catch (error) {
    console.error("Error persistDebitDespachoImport:", error);
    await prisma.cardImportBatch
      .update({
        where: { id: batch.id },
        data: { status: "REJECTED", rejectedCount: parsed.errors.length, completedAt: new Date() },
      })
      .catch(() => undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al procesar el despacho de débito" },
      { status: 500 },
    );
  }
}
