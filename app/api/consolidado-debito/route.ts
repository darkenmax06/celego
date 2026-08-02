import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { listDebitConsolidations } from "@/lib/debit-consolidation/service";

export async function GET(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 30);
  return NextResponse.json({ runs: await listDebitConsolidations(limit) });
}
