import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { createDebitPreview } from "@/lib/debit-consolidation/service";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

async function workbook(form: FormData, key: string, required = false) {
  const value = form.get(key);
  if (!(value instanceof File) || value.size === 0) {
    if (required) throw new Error(`FILE_REQUIRED:${key}`);
    return null;
  }
  if (!value.name.toLowerCase().endsWith(".xlsx")) throw new Error("XLSX_REQUIRED");
  if (value.size > MAX_FILE_SIZE) throw new Error("FILE_TOO_LARGE");
  return { name: value.name, buffer: Buffer.from(await value.arrayBuffer()) };
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;
  try {
    const form = await request.formData();
    const rawDate = String(form.get("dispatchDate") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw new Error("DISPATCH_DATE_REQUIRED");
    const dispatchDate = new Date(`${rawDate}T00:00:00`);
    if (Number.isNaN(dispatchDate.getTime())) throw new Error("DISPATCH_DATE_REQUIRED");
    const base = await workbook(form, "consolidatedFile", true);
    const newCards = await workbook(form, "newCardsFile");
    const statusReport = await workbook(form, "statusFile");
    const result = await createDebitPreview({
      base: base!,
      newCards,
      statusReport,
      dispatchDate,
      createdById: auth.session.user.id,
      actorEmail: auth.session.user.email,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PREVIEW_FAILED";
    const status = code.startsWith("FILE_REQUIRED") ||
      ["XLSX_REQUIRED", "FILE_TOO_LARGE", "DISPATCH_DATE_REQUIRED", "DEBIT_SOURCE_FILE_REQUIRED"].includes(code)
      ? 400
      : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
