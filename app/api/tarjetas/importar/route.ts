import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { parseCardsImport } from "@/lib/importers/cards";
import { upsertCardsFromImport } from "@/lib/card-service";

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const parsed = parseCardsImport(Buffer.from(bytes));
  const importResult = await upsertCardsFromImport(parsed.rows, auth.session.user.id);

  return NextResponse.json({
    ...importResult,
    errors: parsed.errors,
    parsedRows: parsed.rows.length,
  });
}
