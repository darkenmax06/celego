import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { updateCardsFromPinitExport } from "@/lib/card-service";
import { parseDebitPinitImport } from "@/lib/importers/debit-pinit-import";

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = parseDebitPinitImport(buffer);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Formato de export de entregas Pinit inválido" },
      { status: 422 },
    );
  }

  const result = await updateCardsFromPinitExport({
    rows: parsed.rows,
    byUserId: auth.session.user.id,
  });

  return NextResponse.json({
    ...result,
    errors: parsed.errors,
    totalRows: parsed.rows.length,
  });
}
